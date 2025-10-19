import { useState } from 'react';
import Chatbot from '../components/chatbot';
import SimpleQuiz from '../components/SimpleQuiz';

export default function App() {
  const [currentView, setCurrentView] = useState('chat');
  const [quizTopic, setQuizTopic] = useState('');

  const handleStartQuiz = (topic) => {
    setQuizTopic(topic);
    setCurrentView('game');
  };

  const handleBackToChat = () => {
    setCurrentView('chat');
  };

  return (
    <div style={{ 
      width: '100%', 
      height: '100vh', 
      position: 'relative', 
      overflow: 'hidden',
      background: 'linear-gradient(135deg, #fef7ff 0%, #f0f9ff 50%, #fef3c7 100%)',
      fontFamily: 'Comfortaa, Arial, sans-serif'
    }}>
      {currentView === 'chat' ? (
        <div style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px',
          position: 'relative'
        }}>
          {/* Floating decorative elements */}
          <div style={{
            position: 'absolute',
            top: '40px',
            left: '40px',
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            background: 'rgba(255, 235, 59, 0.3)',
            animation: 'float 4s ease-in-out infinite'
          }} />
          <div style={{
            position: 'absolute',
            top: '25%',
            right: '80px',
            width: '48px',
            height: '48px',
            borderRadius: '50%',
            background: 'rgba(236, 64, 122, 0.3)',
            animation: 'float 5s ease-in-out infinite 1s'
          }} />
          <div style={{
            position: 'absolute',
            bottom: '80px',
            left: '25%',
            width: '80px',
            height: '80px',
            borderRadius: '50%',
            background: 'rgba(33, 150, 243, 0.3)',
            animation: 'float 6s ease-in-out infinite 0.5s'
          }} />
          <div style={{
            position: 'absolute',
            bottom: '33%',
            right: '33%',
            width: '40px',
            height: '40px',
            borderRadius: '50%',
            background: 'rgba(156, 39, 176, 0.3)',
            animation: 'pulse 8s ease-in-out infinite'
          }} />
          
          <div style={{
            maxWidth: '600px',
            width: '100%',
            background: 'white',
            borderRadius: '20px',
            boxShadow: '0 10px 30px rgba(0,0,0,0.1)',
            padding: '30px',
            textAlign: 'center'
          }}>
            <h1 style={{ 
              color: '#4A4458', 
              marginBottom: '20px',
              fontSize: '2.5rem',
              fontWeight: '600'
            }}>
              Welcome to Aristotle
            </h1>
            <p style={{ 
              color: '#666', 
              marginBottom: '30px',
              fontSize: '1.1rem'
            }}>
              Your AI learning companion. Let's start a conversation and discover what you'd like to learn!
            </p>
            
            <Chatbot onStartQuiz={handleStartQuiz} />
          </div>
        </div>
        ) : (
          <div style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
          }}>
            <SimpleQuiz topic={quizTopic} onBack={handleBackToChat} />
          </div>
        )}

      <style jsx>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px) rotate(0deg); }
          50% { transform: translateY(-20px) rotate(5deg); }
        }
        
        @keyframes pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.2); }
        }
      `}</style>
    </div>
  );
}
