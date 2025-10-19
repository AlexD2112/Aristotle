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
            <div className="p-4">
                <h2>Quiz Complete!</h2>
                <p>Your score: {score} out of {quizData.questions.length}</p>
            </div>
        );
    }

    return (
        <div className="p-4">
            <h2>{quizData.name || "Quiz"}</h2>
            <div>Time left: {timeLeft}s</div>
            <div className="my-4">
                <h3>Question {currentQuestion + 1}: {quizData.questions[currentQuestion].question}</h3>
                <div className="space-y-2">
                    {quizData.questions[currentQuestion].options.map((option, index) => (
                        <button
                            key={index}
                            onClick={() => !isAnswered && handleAnswer(index)}
                            className={`block w-full p-2 text-left border ${
                                isAnswered
                                     ? index === quizData.questions[currentQuestion].answer[0]
                                        ? 'answer correct'
                                        : selectedOption === index
                                        ? 'answer incorrect'
                                        : 'answer'
                                    : 'answer'
                            }`}
                        >
                            {option}
                        </button>
                    ))}
                </div>
                {isAnswered && (
                    <div className="mt-4">
                        {quizData.questions[currentQuestion].explanation}
                    </div>
                )}
            </div>
        </div>
    );}
