from flask import Flask, request, jsonify
from bs4 import BeautifulSoup
import requests
import re
import sys

app = Flask(__name__)

def extract_article(url):
    """Extract article title and content from a webpage."""
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
    
    try:
        response = requests.get(url, headers=headers, timeout=15)
        response.raise_for_status()
        
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # Extract title
        title = soup.find('title')
        title_text = title.get_text(strip=True) if title else 'Unknown Article'
        
        # Extract main content - look for common article containers
        content_divs = []
        for tag in ['article', 'main', 'div']:
            content_divs.extend(soup.find_all(tag, class_=re.compile(r'content|article|post', re.I)))
        
        # If no specific content found, use body
        if not content_divs:
            content_divs = [soup.find('body')]
        
        content = ''
        for div in content_divs[:5]:  # Get first 5 relevant divs
            if div:
                # Remove script and style elements
                for elem in div(['script', 'style', 'nav', 'footer', 'header']):
                    elem.decompose()
                text = div.get_text(separator='\n')
                # Clean up whitespace
                lines = [line.strip() for line in text.splitlines()]
                content += '\n'.join(line for line in lines if line)
                break
        
        # Extract more text if content is too short
        if len(content) < 200:
            for paragraph in soup.find_all('p'):
                text = paragraph.get_text(strip=True)
                if len(text) > 50 and text not in content:
                    content += '\n' + text
                if len(content) > 1000:
                    break
        
        return {
            'title': title_text,
            'content': content
        }
    except Exception as e:
        return None

@app.route('/scrape', methods=['POST'])
def scrape():
    try:
        data = request.get_json()
        url = data.get('url')
        
        if not url:
            return jsonify({'error': 'URL is required'}), 400
        
        result = extract_article(url)
        if result:
            return jsonify(result)
        else:
            return jsonify({'error': 'Could not extract article content'}), 404
            
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(port=5001)
