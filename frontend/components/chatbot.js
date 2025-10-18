import { useState, useRef, useEffect} from 'react';

export default function Chatbot() {
  const backendBase = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://127.0.0.1:6767'
    const [messages, setMessages] = useState([ 
        {role: 'bot', content: "Hello, I'm Aristotle, your learning assistant. What topics would you like to learn about?"} 
    ]);
    const [input, setInput] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const [conversationState, setConversationState] = useState('topics'); // topics, materials
    const [userData, setUserData] = useState({
        topics: [],
        materials: []
    });
    const messagesEndRef = useRef(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({behavior: "smooth"});
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!input.trim()) return;

        const userMessage = { role: 'user', content: input};
        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setIsTyping(true);

        try {
            const response = await fetch(`${backendBase}/api/chatbot`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                message: input,
                conversationState,
                userData
              })
            });
      
            const data = await response.json();
            
            setMessages(prev => [...prev, { role: 'bot', content: data.response }]);
            setConversationState(data.nextState);
            setUserData(data.updatedUserData);
          } catch (error) {
            setMessages(prev => [...prev, { 
              role: 'bot', 
              content: "Sorry, I encountered an error. Please try again." 
            }]);
          } finally {
            setIsTyping(false);
          }
        };

        const handleFileUpload = async (e) => {
            const file = e.target.files[0];
            if (!file) return;
        
            const formData = new FormData();
            formData.append('file', file);
            formData.append('conversationState', conversationState);
            formData.append('userData', JSON.stringify(userData));
        
            try {
              const response = await fetch(`${backendBase}/api/upload-material`, {
                method: 'POST',
                body: formData
              });
        
              const data = await response.json();
              setMessages(prev => [...prev, { role: 'bot', content: data.response }]);
              setConversationState(data.nextState);
              setUserData(data.updatedUserData);
            } catch (error) {
              setMessages(prev => [...prev, { 
                role: 'bot', 
                content: "Sorry, I couldn't process that file. Please try again." 
              }]);
            }
          };

          return (
            <div className="chatbot-container">
              <div className="messages">
                {messages.map((msg, idx) => (
                  <div key={idx} className={`message ${msg.role}`}>
                    {msg.content}
                  </div>
                ))}
                {isTyping && <div className="message bot typing">...</div>}
                <div ref={messagesEndRef} />
              </div>
              
              <form onSubmit={handleSubmit} className="input-form">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Type your message..."
                  className="message-input"
                />
                <button type="submit" className="send-button">Send</button>
              </form>
              
              <div className="file-upload">
                <input
                  type="file"
                  onChange={handleFileUpload}
                  accept=".pdf,.txt,.doc,.docx"
                  className="file-input"
                />
                <label className="file-label">Upload Study Material</label>
              </div>
            </div>
          );
}