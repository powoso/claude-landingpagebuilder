const express = require("express");
const Anthropic = require("@anthropic-ai/sdk").default;
const path = require("path");
const { execSync } = require("child_process");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "public")));

const client = new Anthropic();

// In-memory history (resets on server restart)
const history = [];

const SYSTEM_PROMPT = `You are an expert landing page designer and conversion rate optimization specialist. Your job is to generate complete, production-ready landing pages using HTML and Tailwind CSS.

When the user describes their product or service, generate a COMPLETE, SINGLE-FILE HTML page that includes:

1. **Navigation Bar** — Clean sticky nav with the product name/logo and smooth-scroll anchor links to each section.
2. **Hero Section** — Compelling headline, subheadline, and a primary CTA button. Use a gradient or bold background. Include a secondary CTA or a small trust indicator (e.g. "No credit card required" or "Trusted by 10,000+ teams").
3. **Logo Cloud / Social Proof Bar** — A row of 5-6 placeholder company names styled as a "Trusted by" bar (use text, not images).
4. **Features Section** — 3-6 key features/benefits displayed in a clean grid with inline SVG icons. Each feature gets a title and short description.
5. **How It Works** — 3-step numbered process showing how the product works, with icons.
6. **Testimonials** — 3 testimonial cards with names, roles, company, and avatar placeholders (colored circles with initials). Use a slightly different background color.
7. **Pricing Section** — 2-3 pricing tiers in card layout. Include a "Most Popular" or "Recommended" badge on the middle tier. Show feature lists per tier.
8. **FAQ Section** — 4-6 frequently asked questions with answers, styled as an accordion or open list.
9. **Final CTA Section** — A strong closing call-to-action with urgency or value reinforcement and a large button.
10. **Footer** — Footer with column links (Product, Company, Support, Legal), copyright, and social media icon placeholders.

Design guidelines:
- Use Tailwind CSS via CDN: <script src="https://cdn.tailwindcss.com"></script>
- Make it fully responsive (mobile-first)
- Use a modern, clean aesthetic with generous whitespace
- Choose a cohesive color palette that matches the product's vibe — use Tailwind's built-in color scales
- Use smooth scroll behavior (add scroll-behavior: smooth to html)
- Add hover effects on buttons (scale, shadow, color shift) and cards (shadow, translate)
- Add subtle transitions (transition-all duration-300)
- Ensure strong visual hierarchy and readability with good font sizes
- Use semantic HTML5 elements (nav, main, section, footer)
- All content must be realistic, specific, and persuasive — absolutely NO lorem ipsum or generic placeholder text
- Write conversion-focused copy that speaks directly to the target audience

CRITICAL RULES:
- Output ONLY the complete HTML code. No markdown, no explanations, no code fences.
- The very first characters must be <!DOCTYPE html> and the last must be </html>
- It must be a single, self-contained file that works perfectly when opened directly in a browser
- Do NOT use any external images or image URLs — only inline SVG icons, CSS gradients, and CSS shapes
- Do NOT include custom JavaScript beyond the Tailwind CDN script tag — use only HTML and CSS
- Tailwind CDN script must be: <script src="https://cdn.tailwindcss.com"></script>`;

// Generate landing page (SSE stream)
app.post("/api/generate", async (req, res) => {
  const { description } = req.body;

  if (!description || description.trim().length === 0) {
    return res.status(400).json({ error: "Please provide a product description." });
  }

  try {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    let fullHTML = "";

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
        fullHTML += event.delta.text;
        res.write(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`);
      }
    }

    // Save to history
    const entry = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      description: description.slice(0, 200),
      title: extractTitle(description),
      html: fullHTML,
      createdAt: new Date().toISOString(),
    };
    history.unshift(entry);
    if (history.length > 50) history.pop();

    res.write(`data: ${JSON.stringify({ done: true, id: entry.id })}\n\n`);
    res.end();
  } catch (err) {
    console.error("Generation error:", err.message);
    if (!res.headersSent) {
      res.status(500).json({
        error: "Failed to generate landing page. Make sure ANTHROPIC_API_KEY is set.",
      });
    } else {
      res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
      res.end();
    }
  }
});

// Get generation history
app.get("/api/history", (_req, res) => {
  res.json(
    history.map(({ id, title, description, createdAt }) => ({
      id,
      title,
      description,
      createdAt,
    }))
  );
});

// Get a single history entry
app.get("/api/history/:id", (req, res) => {
  const entry = history.find((h) => h.id === req.params.id);
  if (!entry) return res.status(404).json({ error: "Not found" });
  res.json(entry);
});

function extractTitle(description) {
  // Try to extract a product name from quotes
  const quoted = description.match(/[""]([^""]+)[""]|"([^"]+)"/);
  if (quoted) return quoted[1] || quoted[2];
  // Try "called X"
  const called = description.match(/called\s+(\S+)/i);
  if (called) return called[1].replace(/[^a-zA-Z0-9]/g, "");
  // Fallback
  return description.slice(0, 30).trim() + "...";
}

// Open browser on macOS
function openBrowser(url) {
  try {
    if (process.platform === "darwin") {
      execSync(`open ${url}`);
    } else if (process.platform === "linux") {
      execSync(`xdg-open ${url} 2>/dev/null || true`);
    }
  } catch {
    // Silently ignore if browser can't be opened
  }
}

app.listen(PORT, () => {
  const url = `http://localhost:${PORT}`;
  console.log("");
  console.log("  \x1b[1m\x1b[35m Landing Page Builder \x1b[0m");
  console.log("  \x1b[2mPowered by Claude\x1b[0m");
  console.log("");
  console.log(`  \x1b[32m>\x1b[0m Local:   \x1b[36m${url}\x1b[0m`);
  console.log("");
  console.log("  \x1b[2mReady to generate landing pages.\x1b[0m");
  console.log("");

  if (process.env.OPEN_BROWSER !== "false") {
    openBrowser(url);
  }
});
