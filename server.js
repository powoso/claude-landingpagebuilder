const express = require("express");
const Anthropic = require("@anthropic-ai/sdk").default;
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "public")));

const client = new Anthropic();

const SYSTEM_PROMPT = `You are an expert landing page designer and conversion rate optimization specialist. Your job is to generate complete, production-ready landing pages using HTML and Tailwind CSS.

When the user describes their product or service, generate a COMPLETE, SINGLE-FILE HTML page that includes:

1. **Hero Section** — Compelling headline, subheadline, and a primary CTA button. Use a gradient or bold background.
2. **Features Section** — 3-6 key features/benefits displayed in a clean grid with icons (use simple SVG icons inline).
3. **Social Proof / Testimonials** — 3 placeholder testimonials with names, roles, and avatar placeholders (use colored circles with initials).
4. **Pricing Section** — 2-3 pricing tiers in card layout. Include a "Most Popular" badge on the recommended tier.
5. **Final CTA Section** — A strong closing call-to-action with urgency or value reinforcement.
6. **Footer** — Simple footer with copyright and placeholder links.

Design guidelines:
- Use Tailwind CSS via CDN (<script src="https://cdn.tailwindcss.com"></script>)
- Make it fully responsive (mobile-first)
- Use a modern, clean aesthetic with good whitespace
- Choose a cohesive color palette that matches the product's vibe
- Use smooth scroll behavior
- Add subtle hover effects on buttons and cards
- Ensure strong visual hierarchy and readability
- Use semantic HTML elements
- All content should be realistic and specific to the described product — NOT generic lorem ipsum
- Write persuasive, conversion-focused copy

CRITICAL RULES:
- Output ONLY the complete HTML code. No markdown, no explanations, no code fences.
- The HTML must start with <!DOCTYPE html> and end with </html>
- It must be a single, self-contained file that works when opened in a browser
- Do NOT use any external images — only SVG icons, gradients, and CSS shapes
- Do NOT include any JavaScript except the Tailwind CDN script tag`;

app.post("/api/generate", async (req, res) => {
  const { description } = req.body;

  if (!description || description.trim().length === 0) {
    return res.status(400).json({ error: "Please provide a product description." });
  }

  try {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const stream = await client.messages.stream({
      model: "claude-sonnet-4-20250514",
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Create a landing page for the following product/service:\n\n${description}`,
        },
      ],
    });

    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        res.write(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`);
      }
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err) {
    console.error("Generation error:", err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to generate landing page. Check your ANTHROPIC_API_KEY." });
    } else {
      res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
      res.end();
    }
  }
});

app.listen(PORT, () => {
  console.log(`Landing Page Builder running at http://localhost:${PORT}`);
});
