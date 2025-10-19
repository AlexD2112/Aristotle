import { useState, useEffect } from 'react';

const jsonFile = {
    "name": "Seattle Mariners",
    "description": "A test on the best team in the MLB!",
    "questions": [{
        "type": "multiple-choice",
        "question": "Which player hit the most home runs for the Seattle Mariners in 2021?",
        "options": ["A: Ken Griffey Jr.", "B: Mitch Haniger", "C: J.P. Crawford", "D: Ty France"],
        "answer": [1],
        "explanation": "The correct answer is B because Mitch Haniger hit the most home runs for the Seattle Mariners in 2021."
    },
    {
        "type": "multiple-choice",
        "question": "Who was the manager of the Seattle Mariners in 2021?",
        "options": ["A: Scott Servais", "B: Bob Melvin", "C: Lloyd McClendon", "D: Jerry Dipoto"],
        "answer": [0],
        "explanation": "The correct answer is A because Scott Servais was the manager of the Seattle Mariners in 2021."
    },
    {
        "type": "multiple-choice",
        "question": "Which player won the American League MVP in 2021 while playing for the Seattle Mariners?",
        "options": ["A: George Springer", "B: Shohei Ohtani", "C: Julio Rodríguez", "D: Marcus Stroman"],
        "answer": [2],
        "explanation": "The correct answer is C because Julio Rodríguez won the American League MVP in 2021 while playing for the Seattle Mariners."
    }]
}

export default function Quiz() {
    const backendBase = "http://localhost:6767"
    const [currentQuestion, setCurrentQuestion] = useState(0);
    const [score, setScore] = useState(0);
    const [showResult, setShowResult] = useState(false);
    const [timeLeft, setTimeLeft] = useState(30);
    const [quizData, setQuizData] = useState(jsonFile); // Initially use default data
    const [selectedOption, setSelectedOption] = useState(null);
    const [isAnswered, setIsAnswered] = useState(false);
    
    useEffect(() => {
        async function fetchQuiz() {
            const queryParams = new URLSearchParams(window.location.search);
            const id = queryParams.get('id');
            if (id) {
                try {
                    const resp = await fetch(`${backendBase}/api/get`, { 
                        headers: { 
                            'X-Key': id,
                            'Access-Control-Allow-Origin': '*'
                        }
                    });
                    
                    if (resp.ok) {
                        const jsonData = await resp.json();
                        console.log(resp);
                        console.log(jsonData);
                        setQuizData(jsonData.data || jsonData);
                        } else {
                        console.error('Failed to load quiz', data);
                    }
                } catch (error) {
                    console.error('Failed to load quiz', error);
                }
            }
        }
        fetchQuiz();
    }, []);
    useEffect(() => {
        if (timeLeft > 0 && !isAnswered) {
            const timer = setTimeout(() => setTimeLeft(timeLeft - 1), 1000);
            return () => clearTimeout(timer);
        } else if (timeLeft === 0 && !isAnswered) {
            handleAnswer(-1);
        }
    }, [timeLeft, isAnswered]);

    const handleAnswer = (optionIndex) => {
        setIsAnswered(true);
        setSelectedOption(optionIndex);
        if (optionIndex === quizData.questions[currentQuestion].answer[0]) {
            setScore(score + 1);
        }
        setTimeout(() => {
            if (currentQuestion < quizData.questions.length - 1) {
                setCurrentQuestion(currentQuestion + 1);
                setTimeLeft(30);
                setSelectedOption(null);
                setIsAnswered(false);
            } else {
                setShowResult(true);
            }
        }, 2000);
    };

    if (showResult) {
        return (
            <div className="quiz-page">
                <div className="quiz-card result-card">
                    <div className="result-content">
                        <h2 className="result-title">Quiz Complete!</h2>
                        <div className="score-display">
                            <span className="score-number">{score}</span>
                            <span className="score-total">out of {quizData.questions.length}</span>
                        </div>
                        <div className="score-percentage">
                            {Math.round((score / quizData.questions.length) * 100)}% Correct
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="quiz-page">
            {/* Header */}
            <div className="quiz-header">
                <div className="quiz-title">{quizData.name || "Quiz"}</div>
                
                <div className="progress-section">
                    <div className="score-badge">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill="white"/>
                        </svg>
                        {score}
                    </div>
                    <div className="progress-text">{Math.round((currentQuestion / quizData.questions.length) * 100)}% Complete</div>
                    <div className="progress-bar">
                        <div className={`progress-fill progress-${Math.round((currentQuestion / quizData.questions.length) * 100)}`}></div>
                    </div>
                </div>
            </div>

            {/* Timer */}
            <div className="timer-section">
                <div className={`timer ${timeLeft <= 10 ? 'timer-warning' : ''}`}>
                    Time left: {timeLeft}s
                </div>
            </div>

            {/* Main Quiz Card */}
            <div className="quiz-card">
                <div className="question-section">
                    <div className="question-decorations">
                        <svg className="decoration-left" width="24" height="24" viewBox="0 0 24 24" fill="none">
                            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill="#FF6B9D"/>
                        </svg>
                        <h2 className="question-text">
                            Question {currentQuestion + 1}: {quizData.questions[currentQuestion].question}
                        </h2>
                        <svg className="decoration-right" width="24" height="24" viewBox="0 0 24 24" fill="none">
                            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" fill="#8B5CF6"/>
                        </svg>
                    </div>
                    
                    <div className="answers-grid">
                        {quizData.questions[currentQuestion].options.map((option, index) => (
                            <button
                                key={index}
                                onClick={() => !isAnswered && handleAnswer(index)}
                                className={`answer-button answer-${index} ${
                                    isAnswered
                                        ? index === quizData.questions[currentQuestion].answer[0]
                                            ? 'correct'
                                            : selectedOption === index
                                            ? 'incorrect'
                                            : 'neutral'
                                        : 'default'
                                }`}
                            >
                                {option}
                            </button>
                        ))}
                    </div>
                    
                    {isAnswered && (
                        <div className="explanation-section">
                            <div className="explanation-text">
                                {quizData.questions[currentQuestion].explanation}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );}
