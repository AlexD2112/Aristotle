import { useState, useEffect } from 'react';
import Chatbot from '../components/chatbot';
import SimpleQuiz from '../components/SimpleQuiz';
import Link from 'next/link';

export default function App() {
  const [currentView, setCurrentView] = useState('home');
  const [showChatbot, setShowChatbot] = useState(false);
  const [userMessage, setUserMessage] = useState('');
  const [quizTopic, setQuizTopic] = useState('');
  
  // AWS Buckets state
  const [buckets, setBuckets] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [quizId, setQuizId] = useState('');

  useEffect(() => {
    const fetchBuckets = async () => {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8080';
      try {
        const res = await fetch(`${backendUrl}/api/aws/buckets`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setBuckets(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchBuckets();
  }, []);

  const handleStartQuiz = (topic) => {
    setQuizTopic(topic);
    setCurrentView('game');
  };

  const handleBackToChat = () => {
    setCurrentView('home');
  };

  const handleSendMessage = () => {
    if (userMessage.trim()) {
      setShowChatbot(true);
      setUserMessage('');
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleSendMessage();
    }
  };

  if (currentView === 'game') {
    return (
      <div className="quiz-view-container">
        <SimpleQuiz topic={quizTopic} onBack={handleBackToChat} />
      </div>
    );
  }

  return (
    <div className="aristotle-home">
      {/* Background with gradient and decorative circles */}
      <div className="background-gradient">
        <div className="decorative-circle circle-1"></div>
        <div className="decorative-circle circle-2"></div>
        <div className="decorative-circle circle-3"></div>
        <div className="decorative-circle circle-4"></div>
      </div>

      {/* Main content */}
      <div className="main-content">
        {/* Header with logo and title */}
        <div className="header-section">
          <div className="logo">
            <div className="logo-icon">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" fill="white"/>
                <path d="M12 6L13.5 10.5L18 12L13.5 13.5L12 18L10.5 13.5L6 12L10.5 10.5L12 6Z" fill="#8B5CF6"/>
              </svg>
            </div>
          </div>
          <h1 className="title">Aristotle</h1>
          <p className="tagline">Your AI tutor for creative learning ✨</p>
        </div>

        {/* Chat interface */}
        <div className="chat-container">
          {/* AI Message */}
          <div className="ai-message">
            <div className="message-bubble">
              Hi there! 👋 I'm Aristotle, your learning companion. What topic would you like to explore today?
            </div>
          </div>

          {/* User Input */}
          <div className="user-input-container">
            <div className="input-wrapper">
              <input
                type="text"
                placeholder="Type a topic you'd like to learn about..."
                value={userMessage}
                onChange={(e) => setUserMessage(e.target.value)}
                onKeyPress={handleKeyPress}
                onFocus={() => setShowChatbot(true)}
                onClick={() => setShowChatbot(true)}
                className="message-input"
              />
              <button 
                onClick={handleSendMessage}
                className="send-button"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path d="M2 21L23 12L2 3V10L17 12L2 14V21Z" fill="white"/>
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* AWS Buckets Section */}
        <div className="buckets-section">
          <h3>AWS S3 Buckets</h3>
          {loading && <p>Loading...</p>}
          {error && (
            <div className="error-container">
              <h4>Error</h4>
              <pre>{error}</pre>
            </div>
          )}
          {buckets && (
            <div>
              {buckets.buckets && buckets.buckets.length > 0 ? (
                <ul className="buckets-list">
                  {buckets.buckets.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              ) : (
                <p>No buckets found or access denied.</p>
              )}
            </div>
          )}
          
          {/* Quiz Links */}
          <div className="quiz-links">
            <p>Quiz</p>
            <Link href="/quiz">Quiz test</Link>
            <Link href="/multiplayer">Multiplayer test</Link>
            <div className="quiz-id-input">
              <input 
                type="text" 
                placeholder="Enter quiz ID"
                onChange={(e) => setQuizId(e.target.value)}
                className="quiz-id-field"
              />
              <Link href={`/quiz?id=${quizId}`}>
                <button className="quiz-go-button">Go to Quiz</button>
              </Link>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="footer">
          <span className="powered-by">Powered by</span>
          <div className="aws-logo">
            <svg width="60" height="20" viewBox="0 0 60 20" fill="none">
              <path d="M0 10C0 4.477 4.477 0 10 0H50C55.523 0 60 4.477 60 10C60 15.523 55.523 20 50 20H10C4.477 20 0 15.523 0 10Z" fill="#FF9900"/>
              <text x="30" y="14" textAnchor="middle" fill="white" fontSize="10" fontWeight="bold">AWS</text>
            </svg>
          </div>
        </div>
      </div>

      {/* Chatbot component (hidden by default, shown when user interacts) */}
      {showChatbot && (
        <div className="chatbot-overlay">
          <div className="chatbot-modal">
            <div className="chatbot-header">
              <h3>Aristotle Learning Assistant</h3>
              <button 
                onClick={() => setShowChatbot(false)}
                className="close-button"
              >
                ×
              </button>
            </div>
            <Chatbot onStartQuiz={handleStartQuiz} />
          </div>
        </div>
      )}
    </div>
  );
}
