/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isProd = process.env.NODE_ENV === 'production';
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

async function startServer() {
  const app = express();

  // Allow up to 50MB for multiple high-resolution photos
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // API endpoint for handwriting transcription
  app.post('/api/transcribe-handwriting', async (req, res) => {
    try {
      const { images, seriesTitle, passage } = req.body;

      if (!images || !Array.isArray(images) || images.length === 0) {
        return res.status(400).json({ error: 'No image photos provided.' });
      }

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({
          error: 'GEMINI_API_KEY is not configured. Please ensure your API key is selected in AI Studio Settings > Secrets.'
        });
      }

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build'
          }
        }
      });

      const contents: any[] = [];

      for (const img of images) {
        if (typeof img === 'string') {
          const match = img.match(/^data:([^;]+);base64,(.+)$/);
          if (match) {
            contents.push({
              inlineData: {
                mimeType: match[1],
                data: match[2]
              }
            });
          } else {
            contents.push({
              inlineData: {
                mimeType: 'image/jpeg',
                data: img
              }
            });
          }
        } else if (img && typeof img === 'object' && img.data) {
          contents.push({
            inlineData: {
              mimeType: img.mimeType || 'image/jpeg',
              data: img.data
            }
          });
        }
      }

      const promptText = `You are an expert transcriber reading photos of handwritten church Sunday School lessons.
This is someone else's handwriting. Transcribe it faithfully.

TRANSCRIBE ACCORDING TO THESE EXACT RULES:
1. Faithfulness: Transcribe what is written. Fix SPELLING errors only. Do NOT change grammar, wording, sentence structure, punctuation style, or Bible reference formats. Do not add, remove, summarize, or rephrase anything.
2. Structure:
   - Standalone headings (e.g. "Introduction", "THE FOURFOLD IDENTITY OF THE ENEMY", "Conclusion:") should be in their own paragraph with bold and underline: <p><b><u>Heading Text</u></b></p>
   - Subheadings that start a paragraph on the SAME line as their body text: keep the subheading on the SAME line as the body text, format the subheading in bold and underline, and continue the body text immediately in the same paragraph without a line break. Example:
     <p><b><u>V. 1-3 - An angel holding a key and a great chain</u></b> John's vision opens with an angel "come down from heaven"...</p>
   - Keep numbered lists and lettered sub-points as numbered paragraphs or lists (<ol><li>...</li></ol>). If a list item has a bold or underlined title, preserve it: e.g. <p>1. <b><u>The key of the bottomless pit.</u></b> It mirrors the key given in Rev. 9:1...</p>
   - Preserve bold, underline, and italic wherever the handwriting shows them (underlined titles, emphasized words, Greek terms, Bible references, etc.).
3. Paragraph flow: If a paragraph continues across a page break from one photo to the next, join it seamlessly into one single paragraph.
4. Circled page numbers: Each handwritten page has its page number circled at the top, except the first page. Use these circled numbers to order the pages in proper sequence. Do NOT include or write the circled page numbers in your transcription.
5. Header exclusion: Do NOT repeat or include the Series Title (${seriesTitle || ''}) or Passage (${passage || ''}) at the top, because the application header block adds them automatically.
6. Uncertain words: If a word is unreadable or uncertain, provide your best guess and wrap it in: <span class="unclear" data-unclear="true" title="unclear">guessed_word</span>. Do not invent or fabricate text.
7. Output format: Return clean, limited HTML only: use <p>, <b>, <i>, <u>, <ol>, <li>, and <span class="unclear" data-unclear="true">...</span>. Do NOT output markdown code blocks (\`\`\`html), do NOT output <html>, <head>, or <body> tags. Output only the paragraphs and lists ready to be inserted directly into a rich text editor.`;

      contents.push(promptText);

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents
      });

      let transcribedText = response.text || '';
      transcribedText = transcribedText
        .replace(/^```html\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();

      return res.json({ html: transcribedText });
    } catch (err: any) {
      console.error('Handwriting transcription error:', err);
      const errMsg = err?.message || String(err);
      return res.status(500).json({ error: errMsg });
    }
  });

  // API endpoint for generating "From the Pastor's Heart" message via Gemini API
  const PASTOR_HEART_SYSTEM_INSTRUCTION = `You write the weekly 'From the Pastor's Heart' message for The Forerunner, the Sunday bulletin of Landmark Bible Baptist Church, a Fundamental Baptist church that uses the King James Bible only. Write in the pastor's own voice, in the style of the sample messages: imitate their tone and structure, not their exact content.
LENGTH: about 117 words. Never fewer than 105 or more than 125. Exactly two paragraphs separated by one blank line.
STRUCTURE: Paragraph 1 states one simple, encouraging truth taken from this week's lesson and includes one or two scripture references in parentheses at the end of a sentence, like (Jude 24-25) or (Hebrews 4:15), using full book names. Paragraph 2 begins with 'Dear beloved,' or 'Beloved,' and applies that truth to the reader's daily life, ending on an encouraging sentence (an exclamation mark is fine).
TOPIC: choose ONE simple practical moral from the lesson (for example trusting God, obedience, faithfulness, prayer, perseverance, love for the Lord). Do not summarize the lesson. Do not explain prophecy details, timelines, interpretation debates or deep theology.
TONE: warm, direct, everyday English, short sentences, speaking to 'you'. Capitalize pronouns for God (He, His, Him, Who). American spelling. An occasional rhetorical question is fine.
DOCTRINE: stay with plain, widely held Bible truths a Fundamental Baptist would be comfortable printing. Never use prosperity or word-of-faith language (no 'breakthrough', 'claim', 'declare', 'decree', 'anointing', 'seed', no promises of health, wealth or success for faith or giving, no guaranteed 'favor'). Never imply that a saved person can lose salvation (no 'fall from grace', no 'lose your salvation'). Do not teach salvation by works or sacraments. Do not speculate about end-time dates or events, and do not mention tongues, signs, visions, new revelation, other Bible versions or other churches. No 'God told me' claims, no stories about the pastor, no quotes from other people. When in doubt, say less.
SCRIPTURE: give references in parentheses only. Do NOT quote verse text. Use only references that truly say what you claim, preferably from the lesson's passage or very well-known KJV verses.
DO NOT include: a title, 'Welcome', a greeting, a closing line, a signature, headings, bullet points, quotation marks around the message, emojis or hashtags.
OUTPUT: plain text only, exactly two paragraphs.`;

  function normalizeTwoParagraphText(raw: string): string {
    let cleaned = (raw || '')
      .replace(/^```(?:text|markdown)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
    if (
      (cleaned.startsWith('"') && cleaned.endsWith('"')) ||
      (cleaned.startsWith("'") && cleaned.endsWith("'"))
    ) {
      cleaned = cleaned.slice(1, -1).trim();
    }
    const paras = cleaned
      .split(/\n\s*\n/)
      .map(p => p.replace(/\s*\n\s*/g, ' ').trim())
      .filter(Boolean);
    if (paras.length >= 2) {
      return `${paras[0]}\n\n${paras.slice(1).join(' ')}`;
    }
    return cleaned;
  }

  function countMessageWords(text: string): number {
    return text.trim() ? text.trim().split(/\s+/).filter(Boolean).length : 0;
  }

  app.post('/api/generate-pastor-heart', async (req, res) => {
    try {
      const {
        passage,
        lessonText,
        isMainPointFallback,
        topicHint,
        styleSamples,
        targetWords
      } = req.body || {};

      const sourceBody = typeof lessonText === 'string' ? lessonText.trim() : '';
      if (!sourceBody) {
        return res.status(400).json({
          error: 'Please provide lesson text or the lesson main point before generating.'
        });
      }

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({
          error: 'AI service is not configured yet (missing GEMINI_API_KEY). Your existing message was kept safe.'
        });
      }

      const parsedTarget =
        typeof targetWords === 'number' && !isNaN(targetWords) && targetWords >= 40
          ? Math.round(targetWords)
          : 117;
      const minWords = parsedTarget === 117 ? 105 : Math.max(40, parsedTarget - 12);
      const maxWords = parsedTarget === 117 ? 125 : parsedTarget + 8;

      const samples: string[] = Array.isArray(styleSamples)
        ? styleSamples.filter((s: unknown): s is string => typeof s === 'string' && s.trim().length > 0).slice(0, 4)
        : [];

      const userPromptParts: string[] = [];
      if (typeof passage === 'string' && passage.trim()) {
        userPromptParts.push(`PASSAGE:\n${passage.trim()}`);
      }
      userPromptParts.push(
        isMainPointFallback
          ? `LESSON'S MAIN POINT:\n${sourceBody}`
          : `THIS WEEK'S LESSON TEXT:\n${sourceBody}`
      );
      if (typeof topicHint === 'string' && topicHint.trim()) {
        userPromptParts.push(`TOPIC HINT (optional focus from editor):\n${topicHint.trim()}`);
      }
      if (samples.length > 0) {
        const formattedSamples = samples
          .map((s, idx) => `Sample ${idx + 1}:\n${s.trim()}`)
          .join('\n\n---\n\n');
        userPromptParts.push(
          `PASTOR'S PAST STYLE SAMPLES (imitate tone and structure only, not content):\n${formattedSamples}`
        );
      }
      userPromptParts.push(
        `TARGET LENGTH: About ${parsedTarget} words (strictly between ${minWords} and ${maxWords} words). Output plain text only: two paragraphs separated by one blank line.`
      );

      const userMessage = userPromptParts.join('\n\n');

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build'
          }
        }
      });

      const firstResponse = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: userMessage,
        config: {
          systemInstruction: PASTOR_HEART_SYSTEM_INSTRUCTION
        }
      });

      let draftText = normalizeTwoParagraphText(firstResponse.text || '');
      let wordCount = countMessageWords(draftText);

      if (!draftText) {
        return res.status(502).json({
          error: 'The AI returned an empty response. Please try again. Your existing message was kept safe.'
        });
      }

      // Single automatic length-adjustment pass if outside acceptable range
      let retried = false;
      if (wordCount < minWords || wordCount > maxWords) {
        retried = true;
        const rewritePrompt = `${userMessage}\n\nPREVIOUS DRAFT (${wordCount} words):\n${draftText}\n\nLENGTH ADJUSTMENT: That draft is ${wordCount} words, which is outside ${minWords}-${maxWords} words. Please rewrite it once to be about ${parsedTarget} words (strictly between ${minWords} and ${maxWords} words). Keep the same voice, structure, and rules: plain text only, two paragraphs separated by one blank line.`;

        const retryResponse = await ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: rewritePrompt,
          config: {
            systemInstruction: PASTOR_HEART_SYSTEM_INSTRUCTION
          }
        });

        const retryText = normalizeTwoParagraphText(retryResponse.text || '');
        if (retryText) {
          draftText = retryText;
          wordCount = countMessageWords(draftText);
        }
      }

      return res.json({
        text: draftText,
        wordCount,
        retried
      });
    } catch (err: any) {
      console.error("Pastor's Heart AI generation error:", err);
      const rawMsg = err?.message || String(err);
      const isQuota =
        err?.status === 429 ||
        /RESOURCE_EXHAUSTED|quota|rate limit|429/i.test(rawMsg);
      const isAuth =
        err?.status === 401 ||
        err?.status === 403 ||
        /PERMISSION_DENIED|API_KEY_INVALID|API key/i.test(rawMsg);

      if (isQuota) {
        return res.status(429).json({
          error: 'AI quota limit has been reached. Please wait a bit and try again later. Your existing message was kept safe.'
        });
      }
      if (isAuth) {
        return res.status(403).json({
          error: 'Could not access the Gemini API key. Check Settings > Secrets in AI Studio. Your existing message was kept safe.'
        });
      }
      return res.status(500).json({
        error: 'Could not generate a draft right now. Please try again. Your existing message was kept safe.'
      });
    }
  });

  if (!isProd) {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        host: '0.0.0.0',
        port: PORT
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on port ${PORT}`);
  });
}

startServer();
