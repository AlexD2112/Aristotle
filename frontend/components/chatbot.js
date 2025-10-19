import { useState, useRef, useEffect, useCallback } from 'react';

// @ts-nocheck
export default function Chatbot() {
  // Prefer using a Next.js rewrite so you can call relative /api/* in prod.
  // Keep env for local/dev.
  const backendBase = process.env.NEXT_PUBLIC_BACKEND_URL || '';

  // ---------- messages ----------
  const [messages, setMessages] = useState([
    { id: 'init', role: 'bot', content: "Hello, I'm Aristotle, your learning assistant. What topics would you like to learn about?" }
  ]);
  const pushBot = useCallback((content) => {
    setMessages(prev => [
      ...prev,
      {
        id:
          (typeof crypto !== 'undefined' && crypto.randomUUID)
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random()}`,
        role: 'bot',
        content
      }
    ]);
  }, []);

  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);

  // ---------- conversation state machine ----------
  const [conversationState, setConversationState] = useState('topics'); // topics, materials, waiting_for_upload, generate_quiz, quiz_ready
  const [userData, setUserData] = useState({ topics: [], materials: [] });

  // Local flow state for generation
  const [awaitingPrompt, setAwaitingPrompt] = useState(false);
  const [awaitingNumQuestions, setAwaitingNumQuestions] = useState(false);
  const [pendingPrompt, setPendingPrompt] = useState('');
  const [materialBased, setMaterialBased] = useState(false);

  // ---------- scrolling ----------
  const messagesEndRef = useRef(null);
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);
  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // ---------- in-flight fetch management ----------
  const ctrlsRef = useRef(new Set());
  useEffect(() => {
    return () => {
      // Abort any in-flight requests on unmount
      for (const c of ctrlsRef.current) c.abort();
      ctrlsRef.current.clear();
    };
  }, []);

  const fetchJSON = useCallback(async (url, init = {}) => {
    const ctrl = new AbortController();
    init.signal = ctrl.signal;
    ctrlsRef.current.add(ctrl);
    try {
      const resp = await fetch(url, init);
      return resp;
    } finally {
      ctrlsRef.current.delete(ctrl);
    }
  }, []);

  // ---------- helpers ----------
  // Safer normalizer: JSON-first, otherwise treat string as a single item (no line splitting).
  function normalizeGenerated(data) {
    if (!data) return null;
    if (Array.isArray(data)) return data;
    if (data.questions && Array.isArray(data.questions)) return data.questions;
    if (data.output && Array.isArray(data.output)) return data.output;
    if (typeof data === 'string') {
      try {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed)) return parsed;
        if (parsed?.questions && Array.isArray(parsed.questions)) return parsed.questions;
      } catch (e) {
        // ignore
      }
      return [data]; // treat the entire string as one item, not many
    }
    return null;
  }

  // Basic renderer for MCQs (if objects), otherwise print strings
  const renderQuestion = (q, i) => {
    if (typeof q === 'string') {
      return <div key={`q-${i}`} className="message bot">{`Q${i + 1}: ${q}`}</div>;
    }
    const { question, choices, answer, explanation } = q;
    return (
      <div key={`q-${i}`} className="message bot">
        <div>{`Q${i + 1}: ${question ?? JSON.stringify(q)}`}</div>
        {Array.isArray(choices) && choices.length > 0 && (
          <ul>
            {choices.map((c, idx) => <li key={idx}>{c}</li>)}
          </ul>
        )}
        {answer != null && <div><strong>Answer:</strong> {String(answer)}</div>}
        {explanation && <div><em>{explanation}</em></div>}
      </div>
    );
  };

  // ---------- API flows ----------
  const handleChatbotPost = useCallback(async (message) => {
    try {
      setIsTyping(true);
      const resp = await fetchJSON(`${backendBase}/api/chatbot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, conversationState, userData })
      });
      if (!resp?.ok) {
        const text = await resp?.text()?.catch(() => '<no body>');
        pushBot(`Server error: ${resp?.status}. ${text}`);
        return;
      }
      const data = await resp.json();
      setConversationState(data.nextState || conversationState);
      setUserData(data.updatedUserData || userData);
      pushBot(data.response || '');
    } catch (e) {
      pushBot('Sorry, I could not reach the server.');
      // Optional: console.error(e);
    } finally {
      setIsTyping(false);
    }
  }, [backendBase, conversationState, userData, fetchJSON, pushBot]);

  const handleGenerate = useCallback(async (numQuestions, promptToUse, sourceLabel) => {
    try {
      setIsTyping(true);
      pushBot('Generating questions — this may take a few seconds...');

      const body = { num_questions: numQuestions, prompt: promptToUse };
      const resp = await fetchJSON(`${backendBase}/api/generate_mcq`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (!resp?.ok) {
        const text = await resp?.text()?.catch(() => '<no body>');
        pushBot(`Generation failed: ${resp?.status} ${text}`);
        return;
      }

      const data = await resp.json();

      // Normalize robustly. Backend may return {questions: [...]}, {output: [...]}, or {raw: '...'}
      let questions =
        normalizeGenerated(data) ||
        normalizeGenerated(data?.raw) ||
        normalizeGenerated(data?.output) ||
        [];

      if (!questions || questions.length === 0) {
        pushBot('I could not parse useful questions from the model output. See console for raw response.');
        // eslint-disable-next-line no-console
        console.log('Raw generate_mcq response:', data);
        return;
      }

      // Enforce requested count
      if (questions.length > numQuestions) {
        // eslint-disable-next-line no-console
        console.log(`Overshoot: requested ${numQuestions}, got ${questions.length}. Trimming.`);
        questions = questions.slice(0, numQuestions);
        pushBot(`The model produced more than ${numQuestions}. I trimmed to ${numQuestions}.`);
      }

      // Display/save
      pushBot(`I generated ${questions.length} questions. Saving them to questionbank...`);

      const savePayload = {
        questions,
        metadata: {
          source: sourceLabel || promptToUse || 'user-prompt',
          topics: userData.topics || [],
          materials: (userData.materials || []).map(m => ({ filename: m.filename }))
        }
      };

      // Build a friendly filename for ContentDisposition, backend will still generate a key if needed
      const safeLabel = (sourceLabel || promptToUse || 'quiz').toString().slice(0, 60).replace(/[^a-zA-Z0-9-_\. ]/g, '').replace(/\s+/g, '_');
      const filename = `${safeLabel}-${Date.now()}.json`;
      savePayload.filename = filename;

      const saveResp = await fetchJSON(`${backendBase}/api/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(savePayload)
      });

      if (!saveResp?.ok) {
        const text = await saveResp?.text()?.catch(() => '<no body>');
        pushBot(`Saving failed: ${saveResp?.status} ${text}`);
        // eslint-disable-next-line no-console
        console.log('Save payload:', savePayload);
        return;
      }

      const saveData = await saveResp.json();
  pushBot(`Saved to questionbank as: ${saveData.key || filename}`);

      // Batch-append all generated questions to the chat to avoid many setState calls
      const questionMessages = questions.map((q, i) => {
        const content = typeof q === 'string' ? q : JSON.stringify(q);
        return { role: 'bot', content: `Q${i + 1}: ${content}` };
      });
      setMessages(prev => [...prev, ...questionMessages]);

      // Reset generator UI state
      setAwaitingNumQuestions(false);
      setAwaitingPrompt(false);
      setPendingPrompt('');
      setMaterialBased(false);

    } catch (e) {
      pushBot('An error occurred while generating or saving questions. See console for details.');
      // eslint-disable-next-line no-console
      console.error(e);
    } finally {
      setIsTyping(false);
    }
  }, [backendBase, fetchJSON, pushBot, userData.topics, userData.materials]);

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    if (isTyping) return; // guard against double submit
    const text = input.trim();
    if (!text) return;

    // If we're awaiting a prompt (user chose to type a prompt), capture it
    if (awaitingPrompt) {
      setMessages(prev => [
        ...prev,
        {
          id: (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`),
          role: 'user',
          content: text
        }
      ]);
      setPendingPrompt(text);
      setInput('');
      setAwaitingPrompt(false);
      // Ask for number of questions next
      pushBot('How many questions would you like me to generate? Please enter a number.');
      setAwaitingNumQuestions(true);
      return;
    }

    // If we're awaiting number of questions, parse and call generate
    if (awaitingNumQuestions) {
      const n = parseInt(text, 10);
      setMessages(prev => [
        ...prev,
        { id: (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`), role: 'user', content: text }
      ]);
      setInput('');
      if (isNaN(n) || n <= 0) {
        pushBot('Please enter a valid positive number for questions.');
        return;
      }

      // Determine prompt source
      if (materialBased && userData.materials && userData.materials.length > 0) {
        const mat = userData.materials[0];
        const preview = (mat.content || '').slice(0, 4000); // trim to avoid huge prompts
        const promptFromMaterial =
          `Create ${n} multiple-choice questions from the following study material:\n\n` +
          `Title: ${mat.filename}\nContent preview:\n${preview}`;
        await handleGenerate(n, promptFromMaterial, mat.filename);
      } else {
        const prompt = pendingPrompt || (userData.topics || []).join(', ') || '';
        await handleGenerate(n, prompt, pendingPrompt ? 'user-typed-prompt' : 'topics');
      }
      return;
    }

    // Otherwise, default to normal chatbot conversation
    setMessages(prev => [
      ...prev,
      { id: (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`), role: 'user', content: text }
    ]);
    setInput('');
    await handleChatbotPost(text);
  }, [
    isTyping,
    input,
    awaitingPrompt,
    awaitingNumQuestions,
    materialBased,
    userData.materials,
    userData.topics,
    pendingPrompt,
    handleGenerate,
    handleChatbotPost,
    pushBot
  ]);

  const handleFileUpload = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setMessages(prev => [
      ...prev,
      {
        id: (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`),
        role: 'user',
        content: `(uploaded file) ${file.name}`
      }
    ]);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('conversationState', conversationState);
    formData.append('userData', JSON.stringify(userData));

    try {
      setIsTyping(true);
      const response = await fetchJSON(`${backendBase}/api/upload-material`, {
        method: 'POST',
        body: formData
      });

      if (!response?.ok) {
        const text = await response?.text()?.catch(() => '<no body>');
        pushBot(`Upload failed: ${response?.status} ${text}`);
        return;
      }

      const data = await response.json();
      setConversationState(data.nextState || conversationState);
      setUserData(data.updatedUserData || userData);
      pushBot(data.response || 'File processed.');

      // After successful upload, prompt for number of questions to generate from material
      pushBot('Would you like me to generate questions from your uploaded material? If yes, how many? Enter a number.');
      setMaterialBased(true);
      setAwaitingNumQuestions(true);

    } catch (error) {
      pushBot("Sorry, I couldn't process that file. Please try again.");
    } finally {
      setIsTyping(false);
      // reset input value so the same file can be re-selected if needed
      e.target.value = '';
    }
  }, [backendBase, conversationState, userData, fetchJSON, pushBot]);

  // ---------- UI bits ----------
  const fileInputRef = useRef(null);

  const ActionsBar = () => {
    if (!['materials', 'waiting_for_upload', 'generate_quiz', 'topics'].includes(conversationState)) return null;
    return (
      <div className="actions-bar">
        <button
          type="button"
          onClick={() => {
            pushBot('Sure — please type a prompt describing what the quiz should cover.');
            setAwaitingPrompt(true);
            setAwaitingNumQuestions(false);
            setMaterialBased(false);
          }}
          disabled={isTyping}
        >
          Type a prompt
        </button>

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isTyping}
        >
          Upload a file
        </button>
        <input
          ref={fileInputRef}
          type="file"
          onChange={handleFileUpload}
          accept=".pdf,.txt,.doc,.docx"
          style={{ display: 'none' }}
        />
      </div>
    );
  };

  return (
    <div className="chatbot-container">
      <div className="messages" aria-live="polite">
        {messages.map((msg) => (
          <div key={msg.id} className={`message ${msg.role}`}>
            {msg.content}
          </div>
        ))}
        {isTyping && <div className="message bot typing" role="status">...</div>}
        <div ref={messagesEndRef} />
      </div>

      <ActionsBar />

      <form onSubmit={handleSubmit} className="input-form" aria-busy={isTyping}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={awaitingPrompt ? 'Type a prompt (e.g. "Explain photosynthesis and ask questions")' : 'Type your message...'}
          className="message-input"
          disabled={isTyping}
        />
        <button type="submit" className="send-button" disabled={isTyping || !input.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}
