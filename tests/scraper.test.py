import pytest
from scraper import extract_article

def test_extract_article_empty_url():
    result = extract_article('')
    assert result is None

def test_extract_article_invalid_url():
    result = extract_article('not-a-valid-url')
    assert result is None

def test_extract_article_structure():
    # Test with a reliable source
    result = extract_article('https://example.com')
    assert result is not None
    assert 'title' in result
    assert 'content' in result

if __name__ == '__main__':
    pytest.main([__file__, '-v'])
