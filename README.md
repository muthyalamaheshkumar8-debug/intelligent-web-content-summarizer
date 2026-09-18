# Real-Time Intelligent Web Content Summarization

A full-stack web application that extracts readable content from webpages and uses AI to generate concise summaries and key points.

## Overview

This project demonstrates clean architecture with separate frontend, backend, and scraper services. It features:

- React frontend with Tailwind CSS
- Express.js REST API with modular architecture
- Python scraping service with BeautifulSoup
- Gemini AI integration for summarization
- MongoDB for data persistence
- Comprehensive error handling
- Testing setup

## Architecture

```
React Frontend → Express API → Python Scraper → Gemini API → MongoDB
```

### Component Breakdown

| Component | Technology | Purpose |
|-----------|------------|---------|
| Frontend | React + Tailwind | User interface |
| Backend | Node.js + Express | REST API, business logic |
| Scraper | Python + BeautifulSoup | Web content extraction |
| AI | Gemini API | Natural language summarization |
| Database | MongoDB + Mongoose | Data persistence |

## Features

- URL-based article extraction
- AI-powered summarization
- Key-point generation
- Summary history
- REST APIs
- MongoDB persistence
- Responsive UI
- Comprehensive error handling
- Input validation

## Tech Stack

- **Frontend:** React, JavaScript ES6+, Tailwind CSS, Axios
- **Backend:** Node.js, Express.js, Mongoose
- **Scraping:** Python, Requests, BeautifulSoup
- **AI:** Gemini API
- **Database:** MongoDB
- **Development:** Git, VS Code, Postman

## Installation

### Prerequisites
- Node.js 18+
- Python 3.8+
- MongoDB (local or Atlas)
- Gemini API key

### Backend Setup

```bash
cd server
npm install
```

### Scraper Setup

```bash
cd scraper
pip install -r requirements.txt
```

### Frontend Setup

```bash
cd client
npm install
```

### Environment Variables

Create `.env` files:

```
# server/.env
GEMINI_API_KEY=your_gemini_api_key_here
MONGODB_URI=your_mongodb_connection_string
PORT=5000
```

```
# scraper/.env (if needed)
```

## Running the Application

### 1. Start the Python Scraper

```bash
cd scraper
python scraper.py
```

### 2. Start the Backend Server

```bash
cd server
npm run dev
```

### 3. Start the Frontend

```bash
cd client
npm run dev
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/summaries | Create new summary |
| GET | /api/summaries | Get summary history |
| GET | /api/summaries/:id | Get specific summary |
| DELETE | /api/summaries/:id | Delete summary |

## Project Structure

```
intelligent-web-content-summarizer/
├── client/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   └── services/
│   └── package.json
├── server/
│   ├── controllers/
│   ├── models/
│   ├── routes/
│   ├── services/
│   ├── middleware/
│   └── server.js
├── scraper/
│   ├── scraper.py
│   └── requirements.txt
└── tests/
```

## Testing

### API Tests

```bash
cd server
npm test
```

### Scraper Tests

```bash
cd tests
pytest
```

## Security Considerations

- Environment variables for sensitive data
- Input validation on all endpoints
- CORS configuration
- Error handling without exposing internals
- Rate limiting recommendations

## Resume Ready

**Real-Time Intelligent Web Content Summarization | React.js, JavaScript, Node.js, Express.js, MongoDB, Python, Gemini API**

- Developed a full-stack web application that extracts webpage content and generates concise AI-powered summaries and key points.
- Built a modular React frontend and Express REST API with separate routing, controller, service, and database layers.
- Implemented webpage content extraction using Python Requests and BeautifulSoup and persisted summary history in MongoDB.
- Added input validation, error handling, and automated API testing to improve application reliability and stability.

## License

MIT
