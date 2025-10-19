import { useState, useRef, useEffect, useCallback } from 'react';

// @ts-nocheck
export default function Chatbot() {
  // Prefer using a Next.js rewrite so you can call relative /api/* in prod.
  // Keep env for local/dev.
  const backendBase = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:6767';

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
  // Modal and pending generation state
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [pendingGeneration, setPendingGeneration] = useState(null);

  // ---------- conversation state machine ----------
  const [conversationState, setConversationState] = useState('topics'); // topics, materials, waiting_for_upload, generate_quiz, quiz_ready
  const [userData, setUserData] = useState({ topics: [], materials: [] });

  // Local flow state for generation
  // Local flow state for generation
  // Persisted saved elements (saved locally): number of questions (<50), files array, prompt string, generateNow boolean
  const [savedElements, setSavedElements] = useState(() => {
    try {
      if (typeof window !== 'undefined') {
        // Initialize by clearing any previously saved local data
        localStorage.removeItem('aristotle_saved');
      }
      return { numQuestions: null, files: [], prompt: '', generateNow: false };
    } catch (e) {
      return { numQuestions: null, files: [], prompt: '', generateNow: false };
    }
  });

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

  // persist savedElements to localStorage whenever it changes
  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem('aristotle_saved', JSON.stringify(savedElements));
      }
    } catch (e) {
      // ignore
    }
  }, [savedElements]);

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

      // Fetch description from backend
      let description = '';
      try {
        const descResp = await fetchJSON(`${backendBase}/api/generate_desc`, {
          method: 'GET',
          headers: { 'X-Prompt': promptToUse }
        });
        if (descResp?.ok) {
          const descData = await descResp.json();
          description = descData?.description || '';
        } else {
          description = '';
        }
      } catch (e) {
        description = '';
      }

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
        pushBot(`TRIMMING - Original questions: ${questions}`)
        questions = questions.slice(0, numQuestions);
        pushBot(`The model produced more than ${numQuestions}. I trimmed to ${numQuestions}.`);
      }

      // Display/save
      pushBot(`I generated ${questions.length} questions. Saving them to questionbank...`);

      const savePayload = {
        name: promptToUse || 'quiz',
        description: description || 'No description provided',
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

  // New chat-first submit handler:
  // - Sends message text to /api/parse_response with an expected schema
  // - Updates local savedElements from parse result
  // - Calls /api/generate_reply to produce a friendly bot reply about missing fields
  // - If mandatory + optional conditions met, triggers generation flow
  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    if (isTyping) return; // prevent double submit
    const text = input.trim();
    if (!text) return;

    // append user message immediately
    const userMsg = { id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`, role: 'user', content: text };
    setMessages(prev => [...prev, userMsg]);
    setInput('');

    try {
      setIsTyping(true);

      // 1) Call parse_response to extract structured fields
      const expected_output = [
        ['num_questions', 'Number of quiz questions to generate for the user on the given subject (integer, <50)', 'integer'],
        ['files', 'Array of files turned into text snippets', 'array'],
        ['prompt', 'Broad prompt describing what is being studied and in what form. Leave null unless this is detailed and in depth', 'string'],
        ['generate_now', 'Does the user want to generate now?', 'boolean']
      ];

      let parsed = null;
      try {
        const pResp = await fetchJSON(`${backendBase}/api/parse_response`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ input_text: text, expected_output })
        });
        if (pResp?.ok) {
          const pData = await pResp.json();
          // parse_response may return {raw:...} or parsed object
          parsed = pData.parsed ?? pData ?? (pData.raw ? pData.raw : null);
        } else {
          // fallback: ignore parse and continue to generate reply
          parsed = null;
        }
      } catch (err) {
        parsed = null;
      }

      // 2) Update savedElements from parsed (if available)
      if (parsed && typeof parsed === 'object') {
        setSavedElements(prev => {
          const next = { ...prev };
          if (parsed.num_questions != null) {
            const n = parseInt(parsed.num_questions, 10);
            next.numQuestions = Number.isNaN(n) ? prev.numQuestions : n;
          }
          if (parsed.files != null) {
            try {
              next.files = Array.isArray(parsed.files) ? parsed.files : [String(parsed.files)];
            } catch (e) {}
          }
          if (parsed.prompt != null) next.prompt = String(parsed.prompt);
          if (parsed.generate_now != null) {
            // Some parsers return strings like 'yes'/'no'
            const val = parsed.generate_now;
            if (typeof val === 'boolean') next.generateNow = val;
            else if (typeof val === 'string') next.generateNow = /^(y|t|1)/i.test(val.trim());
            else next.generateNow = Boolean(val);
          }
          return next;
        });
      }

      // Build merged view of savedElements + parsed so we can pass context to generate_reply
      const current = (() => {
        try {
          const raw = typeof window !== 'undefined' ? localStorage.getItem('aristotle_saved') : null;
          return raw ? JSON.parse(raw) : savedElements;
        } catch (e) { return savedElements; }
      })();

      const merged = { ...current };
      if (parsed && typeof parsed === 'object') {
        if (parsed.num_questions != null) merged.numQuestions = Number.isNaN(parseInt(parsed.num_questions, 10)) ? merged.numQuestions : parseInt(parsed.num_questions, 10);
        if (parsed.files != null) merged.files = Array.isArray(parsed.files) ? parsed.files : [String(parsed.files)];
        if (parsed.prompt != null) merged.prompt = String(parsed.prompt);
        if (parsed.generate_now != null) merged.generateNow = typeof parsed.generate_now === 'boolean' ? parsed.generate_now : /^(y|t|1)/i.test(String(parsed.generate_now).trim());
      }

      // 3) Call generate_reply to get a conversational reply about what's missing, passing merged context
      let replyText = '';
      try {
        // Provide the model with current collected values so it doesn't re-ask for information already supplied
        const genResp = await fetchJSON(`${backendBase}/api/generate_reply`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            input_text: `Context: ${JSON.stringify(merged)}\n\nUser message: ${text}`,
            mandatory_empty_values: ['num_questions', 'generate_now'],
            one_of_empty_values: ['prompt', 'files']
          })
        });
        if (genResp?.ok) {
          const gd = await genResp.json();
          replyText = gd.chat_response || JSON.stringify(gd);
        } else {
          replyText = `Server error: ${genResp?.status}`;
        }
      } catch (err) {
        replyText = 'Sorry, I could not generate a reply.';
      }

      // show generated reply
      pushBot(replyText);

      // enforce upper bound for questions
      if (merged.numQuestions != null && merged.numQuestions >= 50) {
        pushBot('Please choose fewer than 50 questions.');
        // don't generate; ask user to adjust
        setSavedElements(prev => ({ ...prev, numQuestions: null }));
        return;
      }

      const hasMandatory = merged.numQuestions && merged.generateNow === true;
      const hasOptional = (merged.prompt && merged.prompt.trim().length > 0) || (Array.isArray(merged.files) && merged.files.length > 0);

      if (hasMandatory && hasOptional) {
        // determine prompt source and show confirmation modal instead of auto-generating
        let promptToUse = merged.prompt || '';
        let sourceLabel = 'user-prompt';
        if ((!promptToUse || promptToUse.trim() === '') && merged.files.length > 0) {
          const mat = (userData.materials || []).find(m => merged.files.includes(m.filename)) || (userData.materials && userData.materials[0]);
          if (mat) {
            const preview = (mat.content || '').slice(0, 4000);
            promptToUse = `Create ${merged.numQuestions} multiple-choice questions from the following study material:\n\nTitle: ${mat.filename}\nContent preview:\n${preview}`;
            sourceLabel = mat.filename;
          } else {
            promptToUse = `Create ${merged.numQuestions} multiple-choice questions based on files: ${merged.files.join(', ')}`;
            sourceLabel = 'files';
          }
        }

        // Store pending generation details and open modal for user confirmation
        setPendingGeneration({ numQuestions: merged.numQuestions, promptToUse, sourceLabel });
        setShowConfirmModal(true);
      }

    } catch (err) {
      pushBot('An error occurred processing your message.');
      // eslint-disable-next-line no-console
      console.error(err);
    } finally {
      setIsTyping(false);
    }
  }, [isTyping, input, backendBase, fetchJSON, pushBot, savedElements, userData.materials, handleGenerate]);

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

      // After successful upload, advise user how to trigger generation
      pushBot('File processed. You can tell me how many questions to generate and say "generate now" when ready.');

      // Persist filename into savedElements.files so the generation condition can be satisfied
      setSavedElements(prev => {
        try {
          const existing = Array.isArray(prev.files) ? prev.files.slice() : [];
          if (!existing.includes(file.name)) existing.push(file.name);
          return { ...prev, files: existing };
        } catch (e) {
          return prev;
        }
      });

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

  // Modal handlers
  const confirmGenerate = useCallback(async () => {
    if (!pendingGeneration) return;
    const { numQuestions, promptToUse, sourceLabel } = pendingGeneration;
    setShowConfirmModal(false);
    try {
      await handleGenerate(numQuestions, promptToUse, sourceLabel);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(e);
      pushBot('Failed to generate questions.');
    } finally {
      setPendingGeneration(null);
      // reset generateNow flag so it doesn't repeatedly fire
      setSavedElements(prev => ({ ...prev, generateNow: false }));
    }
  }, [pendingGeneration, handleGenerate, pushBot]);

  const cancelGenerate = useCallback(() => {
    setShowConfirmModal(false);
    setPendingGeneration(null);
    pushBot('Okay — feel free to add more info or say "generate now" when ready.');
  }, [pushBot]);

  const ActionsBar = () => {
    if (!['materials', 'waiting_for_upload', 'generate_quiz', 'topics'].includes(conversationState)) return null;
    return (
      <div className="actions-bar">
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

      {/* Confirmation modal for generation */}
      {showConfirmModal && pendingGeneration && (
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="modal" role="dialog" aria-modal="true" style={{ background: 'white', padding: 20, borderRadius: 8, maxWidth: '90%', width: 480 }}>
            <h3>Ready to generate?</h3>
            <p>I'll create {pendingGeneration.numQuestions} multiple-choice questions using:</p>
            <pre style={{ maxHeight: 160, overflow: 'auto', background: '#f6f6f6', padding: 8 }}>{pendingGeneration.sourceLabel || ''}
{pendingGeneration.promptToUse?.slice(0, 800)}</pre>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
              <button type="button" onClick={cancelGenerate} disabled={isTyping}>Keep adding info</button>
              <button type="button" onClick={confirmGenerate} disabled={isTyping} style={{ background: '#0b6', color: 'white' }}>Generate now</button>
            </div>
          </div>
        </div>
      )}

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
