import { useState } from 'react';

export default function SimpleQuiz({ topic, onBack }) {
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [score, setScore] = useState(0);
  const [showResults, setShowResults] = useState(false);

  // Sample quiz questions - in a real app, these would come from your backend
  const questions = [
    {
      question: `What is the main concept in ${topic}?`,
      options: ['Option A', 'Option B', 'Option C', 'Option D'],
      correct: 0
    },
    {
      question: `Which of the following is most important in ${topic}?`,
      options: ['Theory', 'Practice', 'Both', 'Neither'],
      correct: 2
    },
    {
      question: `How would you apply ${topic} in real life?`,
      options: ['Method 1', 'Method 2', 'Method 3', 'Method 4'],
      correct: 1
    }
  ];

  const handleAnswer = (selectedIndex) => {
    if (selectedIndex === questions[currentQuestion].correct) {
      setScore(score + 1);
    }

    if (currentQuestion < questions.length - 1) {
      setCurrentQuestion(currentQuestion + 1);
    } else {
      setShowResults(true);
    }
  };

  const resetQuiz = () => {
    setCurrentQuestion(0);
    setScore(0);
    setShowResults(false);
  };

  if (showResults) {
    return (
      <div style={{
        maxWidth: '600px',
        margin: '0 auto',
        padding: '40px',
        background: 'white',
        borderRadius: '20px',
        boxShadow: '0 10px 30px rgba(0,0,0,0.1)',
        textAlign: 'center'
      }}>
        <h2 style={{ color: '#4A4458', marginBottom: '20px' }}>
          Quiz Complete! 🎉
        </h2>
        <div style={{
          fontSize: '3rem',
          fontWeight: 'bold',
          color: score >= questions.length / 2 ? '#28a745' : '#dc3545',
          marginBottom: '20px'
        }}>
          {score}/{questions.length}
        </div>
        <p style={{ color: '#666', marginBottom: '30px', fontSize: '1.1rem' }}>
          {score >= questions.length / 2 
            ? `Great job! You scored ${Math.round((score/questions.length) * 100)}%`
            : `Keep studying! You scored ${Math.round((score/questions.length) * 100)}%`
          }
        </p>
        <div style={{ display: 'flex', gap: '15px', justifyContent: 'center' }}>
          <button 
            onClick={resetQuiz}
            style={{
              padding: '12px 24px',
              background: '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '1rem'
            }}
          >
            Try Again
          </button>
          <button 
            onClick={onBack}
            style={{
              padding: '12px 24px',
              background: '#6c757d',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '1rem'
            }}
          >
            Back to Chat
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      maxWidth: '800px',
      margin: '0 auto',
      padding: '40px',
      background: 'white',
      borderRadius: '20px',
      boxShadow: '0 10px 30px rgba(0,0,0,0.1)'
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '30px'
      }}>
        <h2 style={{ color: '#4A4458', margin: 0 }}>
          Quiz: {topic}
        </h2>
        <div style={{
          background: '#f8f9fa',
          padding: '8px 16px',
          borderRadius: '20px',
          fontSize: '0.9rem',
          color: '#666'
        }}>
          Question {currentQuestion + 1} of {questions.length}
        </div>
      </div>

      <div style={{
        background: '#f8f9fa',
        height: '8px',
        borderRadius: '4px',
        marginBottom: '30px',
        overflow: 'hidden'
      }}>
        <div style={{
          background: 'linear-gradient(90deg, #667eea 0%, #764ba2 100%)',
          height: '100%',
          width: `${((currentQuestion + 1) / questions.length) * 100}%`,
          transition: 'width 0.3s ease'
        }} />
      </div>

      <h3 style={{
        color: '#4A4458',
        marginBottom: '30px',
        fontSize: '1.5rem',
        lineHeight: '1.4'
      }}>
        {questions[currentQuestion].question}
      </h3>

      <div style={{ display: 'grid', gap: '15px' }}>
        {questions[currentQuestion].options.map((option, index) => (
          <button
            key={index}
            onClick={() => handleAnswer(index)}
            style={{
              padding: '15px 20px',
              border: '2px solid #e9ecef',
              background: 'white',
              borderRadius: '10px',
              cursor: 'pointer',
              textAlign: 'left',
              fontSize: '1rem',
              transition: 'all 0.3s ease',
              color: '#4A4458'
            }}
            onMouseOver={(e) => {
              e.target.style.borderColor = '#667eea';
              e.target.style.background = '#f8f9ff';
            }}
            onMouseOut={(e) => {
              e.target.style.borderColor = '#e9ecef';
              e.target.style.background = 'white';
            }}
          >
            {option}
          </button>
        ))}
      </div>

      <div style={{
        marginTop: '30px',
        textAlign: 'center'
      }}>
        <button 
          onClick={onBack}
          style={{
            padding: '10px 20px',
            background: 'transparent',
            color: '#6c757d',
            border: '1px solid #6c757d',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '0.9rem'
          }}
        >
          ← Back to Chat
        </button>
      </div>
    </div>
  );
}
