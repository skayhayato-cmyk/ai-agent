'use strict';
const config = require('./config');

function buildErrorMessage(status, raw) {
  let detail = raw;
  try {
    const parsed = JSON.parse(raw);
    detail = (parsed.error && parsed.error.message) || parsed.message || raw;
  } catch (_) {
    // bukan JSON, biarin raw text apa adanya
  }
  return `API error ${status}: ${String(detail).slice(0, 500)}`;
}

// Mode non-streaming (stream:false) -- tetep manggil onDelta sekali dengan
// full content, biar agent.js gak perlu tau bedanya jalur stream vs non-stream.
async function chatCompletionOnce({ model, messages, tools, onDelta }) {
  const res = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, tools, tool_choice: 'auto', stream: false }),
  });

  const raw = await res.text();
  if (!res.ok) throw new Error(buildErrorMessage(res.status, raw));

  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    throw new Error(`Gagal parse respons API sebagai JSON: ${e.message}`);
  }

  const message = data.choices && data.choices[0] && data.choices[0].message;
  if (!message) throw new Error('Respons API gak ada choices[0].message.');
  if (message.content && onDelta) onDelta(message.content);
  return message;
}

async function chatCompletionStream({ model, messages, tools, onDelta }) {
  const res = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, tools, tool_choice: 'auto', stream: true }),
  });

  if (!res.ok) {
    const raw = await res.text();
    throw new Error(buildErrorMessage(res.status, raw));
  }

  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('text/event-stream') || !res.body) {
    // Fallback: server gak balikin SSE beneran walau kita minta stream:true.
    const raw = await res.text();
    let data;
    try {
      data = JSON.parse(raw);
    } catch (e) {
      throw new Error(`Gagal parse respons API sebagai JSON: ${e.message}`);
    }
    const message = data.choices && data.choices[0] && data.choices[0].message;
    if (!message) throw new Error('Respons API gak ada choices[0].message.');
    if (message.content && onDelta) onDelta(message.content);
    return message;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let finalContent = '';
  const toolCallsAcc = [];
  let sawAnyDelta = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let lineEnd;
    while ((lineEnd = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, lineEnd).trim();
      buffer = buffer.slice(lineEnd + 1);
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') continue;

      let chunk;
      try {
        chunk = JSON.parse(data);
      } catch (_) {
        continue; // skip chunk yang gak valid JSON
      }

      const choice = chunk.choices && chunk.choices[0];
      if (!choice) continue;
      const delta = choice.delta || {};

      if (delta.content) {
        sawAnyDelta = true;
        finalContent += delta.content;
        if (onDelta) onDelta(delta.content);
      }

      if (delta.tool_calls) {
        sawAnyDelta = true;
        for (const tcDelta of delta.tool_calls) {
          const idx = typeof tcDelta.index === 'number' ? tcDelta.index : 0;
          if (!toolCallsAcc[idx]) {
            toolCallsAcc[idx] = { id: '', type: 'function', function: { name: '', arguments: '' } };
          }
          const acc = toolCallsAcc[idx];
          if (tcDelta.id) acc.id = tcDelta.id;
          if (tcDelta.type) acc.type = tcDelta.type;
          if (tcDelta.function) {
            if (tcDelta.function.name) acc.function.name += tcDelta.function.name;
            if (tcDelta.function.arguments) acc.function.arguments += tcDelta.function.arguments;
          }
        }
      }
    }
  }

  if (!sawAnyDelta) {
    throw new Error(
      'Stream selesai tapi gak ada delta konten/tool_call sama sekali -- kemungkinan format respons API beda dari yang diharapkan.'
    );
  }

  const toolCalls = toolCallsAcc.filter(Boolean);
  return {
    role: 'assistant',
    content: finalContent || null,
    tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
  };
}

async function chatCompletion({ model, messages, tools, onDelta }) {
  if (config.stream) {
    return chatCompletionStream({ model, messages, tools, onDelta });
  }
  return chatCompletionOnce({ model, messages, tools, onDelta });
}

module.exports = { chatCompletion };
