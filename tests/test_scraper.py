import importlib.util
from pathlib import Path
import socket
import pytest

spec = importlib.util.spec_from_file_location('article_scraper', Path(__file__).parents[1] / 'scraper' / 'scraper.py')
scraper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(scraper)

HTML = b'<html><head><title>A thoughtful article</title></head><body><nav>Navigation noise</nav><article><h1>Ideas</h1><p>' + b'This article describes reliable software and clear interfaces. ' * 10 + b'</p><script>bad()</script></article><footer>Footer noise</footer></body></html>'


@pytest.fixture
def public_dns(monkeypatch):
    monkeypatch.setattr(socket, 'getaddrinfo', lambda *args, **kwargs: [(socket.AF_INET, socket.SOCK_STREAM, 6, '', ('93.184.216.34', 443))])


@pytest.mark.parametrize('url', ['', 'bad-url', 'file:///etc/passwd', 'http://u:p@example.com', 'https://example.com:8000', 'https://example.com/\npath', 'http://example.local'])
def test_rejects_malformed_targets(url):
    with pytest.raises(scraper.ScrapeError) as error:
        scraper.validate_target(url)
    assert error.value.status == 400


@pytest.mark.parametrize('address', ['127.0.0.1', '10.0.0.1', '172.16.0.1', '192.168.1.2', '169.254.169.254', '0.0.0.0', '224.0.0.1', '::1', 'fe80::1', '::ffff:127.0.0.1', '2002:7f00:1::'])
def test_rejects_private_and_special_addresses(address, monkeypatch):
    monkeypatch.setattr(socket, 'getaddrinfo', lambda *args, **kwargs: [(socket.AF_INET, socket.SOCK_STREAM, 6, '', (address, 80))])
    with pytest.raises(scraper.ScrapeError) as error:
        scraper.validate_target('https://public-looking.example/article')
    assert error.value.status == 403


def test_mixed_public_private_dns_is_blocked(monkeypatch):
    monkeypatch.setattr(socket, 'getaddrinfo', lambda *args, **kwargs: [(socket.AF_INET, socket.SOCK_STREAM, 6, '', (address, 80)) for address in ['93.184.216.34', '127.0.0.1']])
    with pytest.raises(scraper.ScrapeError):
        scraper.validate_target('https://example.com')


def test_pins_public_ip_while_preserving_host_and_tls(public_dns, monkeypatch):
    calls = {}
    class Pool:
        def __init__(self, ip, port, **kwargs):
            calls.update(ip=ip, port=port, **kwargs)
        def request(self, method, path, **kwargs):
            calls.update(method=method, path=path, **kwargs)
            return object()
        def close(self):
            pass
    monkeypatch.setattr(scraper.urllib3, 'HTTPSConnectionPool', Pool)
    _, pool = scraper.open_public_response('https://example.com/article?x=1')
    assert calls['ip'] == '93.184.216.34'
    assert calls['server_hostname'] == 'example.com'
    assert calls['assert_hostname'] == 'example.com'
    assert calls['headers']['Host'] == 'example.com'
    assert calls['path'] == '/article?x=1'
    assert calls['redirect'] is False
    pool.close()


class Response:
    def __init__(self, status=200, headers=None, chunks=None):
        self.status = status
        self.headers = headers if headers is not None else {'Content-Type': 'text/html'}
        self.chunks = chunks if chunks is not None else [HTML]
        self.closed = False
    def stream(self, *args, **kwargs):
        yield from self.chunks
    def close(self):
        self.closed = True


class Pool:
    def close(self):
        pass


def test_redirect_to_private_ip_is_revalidated(monkeypatch):
    calls = []
    def dns(host, *args, **kwargs):
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, '', ('127.0.0.1' if host == 'internal.example' else '93.184.216.34', 443))]
    def open_response(url):
        scraper.validate_target(url)
        calls.append(url)
        return Response(302, {'Location': 'http://internal.example/secret'}), Pool()
    monkeypatch.setattr(socket, 'getaddrinfo', dns)
    monkeypatch.setattr(scraper, 'open_public_response', open_response)
    with pytest.raises(scraper.ScrapeError) as error:
        scraper.fetch_html('https://example.com')
    assert error.value.status == 403
    assert calls == ['https://example.com']


@pytest.mark.parametrize('response,status', [(Response(headers={'Content-Type': 'application/pdf'}), 415), (Response(headers={'Content-Type': 'text/html', 'Content-Encoding': 'gzip'}), 415), (Response(headers={'Content-Type': 'text/html', 'Content-Length': '9999999'}), 422), (Response(chunks=[b'a' * (scraper.MAX_BYTES + 1)]), 422), (Response(404), 422)])
def test_response_limits_and_cleanup(response, status, monkeypatch):
    monkeypatch.setattr(scraper, 'open_public_response', lambda url: (response, Pool()))
    with pytest.raises(scraper.ScrapeError) as error:
        scraper.fetch_html('https://example.com')
    assert error.value.status == status
    assert response.closed


def test_extracts_semantic_article_and_removes_page_noise():
    result = scraper.parse_article(HTML)
    assert result['title'] == 'A thoughtful article'
    assert 'reliable software' in result['content']
    assert 'Navigation noise' not in result['content']
    assert 'Footer noise' not in result['content']
    assert 'bad()' not in result['content']


def test_short_content_is_rejected_and_long_content_is_bounded():
    with pytest.raises(scraper.ScrapeError):
        scraper.parse_article('<p>Too short</p>')
    assert len(scraper.parse_article('<article><p>' + 'word ' * 20000 + '</p></article>')['content']) == 50000


def test_flask_validation_service_token_and_safe_failures(monkeypatch):
    client = scraper.app.test_client()
    monkeypatch.setenv('SCRAPER_TOKEN', 'private-test-token')
    assert client.get('/health').status_code == 401
    headers = {'X-Scraper-Token': 'private-test-token'}
    assert client.get('/health', headers=headers).status_code == 200
    for value in [None, [], {}, {'url': 123}]:
        assert client.post('/scrape', json=value, headers=headers).status_code == 400
    assert client.post('/scrape', data='{' , content_type='application/json', headers=headers).status_code == 400
    monkeypatch.setattr(scraper, 'extract_article', lambda url: scraper.parse_article(HTML))
    assert client.post('/scrape', json={'url': 'https://example.com'}, headers=headers).json['title'] == 'A thoughtful article'
    def fail(_url):
        raise RuntimeError('secret URL or token')
    monkeypatch.setattr(scraper, 'extract_article', fail)
    response = client.post('/scrape', json={'url': 'https://example.com'}, headers=headers)
    assert response.status_code == 503
    assert 'secret' not in response.get_data(as_text=True)
