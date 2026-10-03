"""Bounded HTML extraction. Every redirect is resolved and pinned to a public IP."""
import hmac
import ipaddress
import logging
import os
import re
import socket
import time
from urllib.parse import urljoin, urlsplit, urlunsplit

import certifi
import urllib3
from bs4 import BeautifulSoup
from flask import Flask, jsonify, request

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 8192
MAX_BYTES = 2 * 1024 * 1024
MAX_CONTENT = 50000
FETCH_SECONDS = 25


class ScrapeError(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status


def validate_target(url):
    if not isinstance(url, str) or not url.strip() or len(url) > 2048 or re.search(r'[\x00-\x20\x7f]', url):
        raise ScrapeError(400, 'Enter a valid public article URL.')
    try:
        parsed = urlsplit(url)
        port = parsed.port or (443 if parsed.scheme == 'https' else 80)
        host = parsed.hostname
        if parsed.scheme not in ('http', 'https') or not host or parsed.username or parsed.password or port not in (80, 443):
            raise ValueError()
        host = host.encode('idna').decode('ascii')
        if '%' in host or host.lower().rstrip('.').endswith(('.local', '.localhost', '.internal')):
            raise ValueError()
    except (ValueError, UnicodeError):
        raise ScrapeError(400, 'Only public HTTP and HTTPS URLs are supported.') from None
    try:
        addresses = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
    except socket.gaierror:
        raise ScrapeError(422, 'The article hostname could not be resolved.') from None
    ips = list(dict.fromkeys(entry[4][0] for entry in addresses))
    if not ips:
        raise ScrapeError(422, 'The article hostname could not be resolved.')
    for address in ips:
        ip = ipaddress.ip_address(address)
        # Mapped IPv6, transition networks and special ranges are rejected as well.
        if not ip.is_global or ip.is_multicast or ip.is_reserved or getattr(ip, 'ipv4_mapped', None) or getattr(ip, 'sixtofour', None) or getattr(ip, 'teredo', None):
            raise ScrapeError(403, 'Private or reserved network addresses are not allowed.')
    return parsed, host, port, ips[0]


def open_public_response(url):
    parsed, host, port, ip = validate_target(url)
    host_header = f'[{host}]' if ':' in host else host
    default = 443 if parsed.scheme == 'https' else 80
    if port != default:
        host_header += f':{port}'
    # Connect to the validated IP; preserve Host, TLS SNI and certificate validation
    # for the original hostname. No second DNS lookup and no environment proxies.
    if parsed.scheme == 'https':
        pool = urllib3.HTTPSConnectionPool(ip, port, server_hostname=host, assert_hostname=host, cert_reqs='CERT_REQUIRED', ca_certs=certifi.where(), maxsize=1)
    else:
        pool = urllib3.HTTPConnectionPool(ip, port, maxsize=1)
    try:
        response = pool.request('GET', urlunsplit(('', '', parsed.path or '/', parsed.query, '')), headers={'Host': host_header, 'User-Agent': 'IntelligentWebSummarizer/1.0', 'Accept': 'text/html,application/xhtml+xml', 'Accept-Encoding': 'identity'}, redirect=False, preload_content=False, retries=False, timeout=urllib3.Timeout(connect=5, read=3))
        return response, pool
    except urllib3.exceptions.HTTPError:
        pool.close()
        raise ScrapeError(504, 'The webpage could not be fetched in time.') from None


def fetch_html(url):
    deadline = time.monotonic() + FETCH_SECONDS
    for _ in range(6):
        if time.monotonic() > deadline:
            raise ScrapeError(504, 'The webpage took too long to load.')
        response, pool = open_public_response(url)
        try:
            if response.status in (301, 302, 303, 307, 308):
                location = response.headers.get('Location')
                if not location:
                    raise ScrapeError(422, 'This page redirected without a destination.')
                url = urljoin(url, location)
                continue
            if response.status >= 400:
                raise ScrapeError(422, 'This page is unavailable or protected.')
            if response.headers.get('Content-Encoding', 'identity').lower() != 'identity':
                raise ScrapeError(415, 'Compressed responses are not supported by this fetcher.')
            content_type = response.headers.get('Content-Type', '').lower()
            if not any(value in content_type for value in ('text/html', 'application/xhtml+xml')):
                raise ScrapeError(415, 'Only HTML articles are supported.')
            try:
                if int(response.headers.get('Content-Length', '0')) > MAX_BYTES:
                    raise ScrapeError(422, 'This webpage is too large.')
            except ValueError:
                raise ScrapeError(422, 'This webpage has invalid headers.') from None
            chunks = []
            size = 0
            for chunk in response.stream(16384, decode_content=True):
                size += len(chunk)
                if size > MAX_BYTES:
                    raise ScrapeError(422, 'This webpage is too large.')
                if time.monotonic() > deadline:
                    raise ScrapeError(504, 'The webpage took too long to load.')
                chunks.append(chunk)
            return b''.join(chunks)
        except urllib3.exceptions.HTTPError:
            raise ScrapeError(504, 'The webpage could not be fetched in time.') from None
        finally:
            response.close()
            pool.close()
    raise ScrapeError(422, 'This webpage redirected too many times.')


def parse_article(html):
    soup = BeautifulSoup(html, 'html.parser')
    title = soup.find('title') or soup.find('h1')
    title_text = title.get_text(' ', strip=True) if title else 'Untitled article'
    for element in soup(['script', 'style', 'nav', 'footer', 'aside', 'noscript', 'svg', 'form']):
        element.decompose()
    container = soup.find('article') or soup.find('main') or soup.find(class_=re.compile(r'(article|post)[-_]?content|entry-content', re.I)) or soup.find('body') or soup
    paragraphs = [node.get_text(' ', strip=True) for node in container.find_all(['h1', 'h2', 'h3', 'p', 'li'])]
    text = '\n'.join(dict.fromkeys(value for value in paragraphs if value))
    if len(text) < 200:
        text = container.get_text('\n', strip=True)
    text = re.sub(r'[ \t]+', ' ', text).strip()[:MAX_CONTENT]
    if len(text) < 200:
        raise ScrapeError(422, 'This page has too little readable article content.')
    return {'title': title_text.strip()[:500] or 'Untitled article', 'content': text}


def extract_article(url):
    return parse_article(fetch_html(url))


@app.before_request
def require_service_token():
    token = os.environ.get('SCRAPER_TOKEN', '')
    if token and not hmac.compare_digest(request.headers.get('X-Scraper-Token', ''), token):
        return jsonify({'error': 'Unauthorized service request.'}), 401


@app.get('/health')
def health():
    return jsonify({'status': 'ok'})


@app.post('/scrape')
def scrape():
    data = request.get_json(silent=True)
    if not isinstance(data, dict) or not isinstance(data.get('url'), str):
        return jsonify({'error': 'A JSON object with an article URL is required.'}), 400
    try:
        return jsonify(extract_article(data['url']))
    except ScrapeError as error:
        return jsonify({'error': str(error)}), error.status
    except Exception:
        # Exception details can contain source URLs or content; do not log them.
        app.logger.error('article_extraction_failed')
        return jsonify({'error': 'Article extraction is temporarily unavailable.'}), 503


@app.errorhandler(413)
def too_large(_error):
    return jsonify({'error': 'Request body is too large.'}), 413


if os.environ.get('APP_ENV') == 'production' and len(os.environ.get('SCRAPER_TOKEN', '')) < 32:
    raise RuntimeError('Production requires SCRAPER_TOKEN with at least 32 characters.')

if __name__ == '__main__':
    logging.basicConfig(level=logging.INFO)
    app.run(host='127.0.0.1', port=5001, debug=False)
