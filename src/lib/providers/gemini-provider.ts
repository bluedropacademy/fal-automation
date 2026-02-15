import { GoogleGenAI } from "@google/genai";
import { GEMINI_MODEL } from "@/lib/constants";

function getGeminiKey(): string {
  const key = process.env.GEMINI_KEY;
  if (!key) throw new Error("GEMINI_KEY environment variable not configured");
  return key;
}

export class GeminiProvider {
  private client: GoogleGenAI;

  constructor() {
    this.client = new GoogleGenAI({ apiKey: getGeminiKey() });
  }

  async analyzeImage(input: {
    imageUrl: string;
    systemPrompt: string;
  }): Promise<string> {
    // Fetch image and convert to base64 (Gemini requires inline data)
    const response = await fetch(input.imageUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    const base64Data = Buffer.from(arrayBuffer).toString("base64");
    const contentType = response.headers.get("content-type") || "image/png";

    const result = await this.client.models.generateContent({
      model: GEMINI_MODEL,
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { mimeType: contentType, data: base64Data } },
            { text: input.systemPrompt },
          ],
        },
      ],
    });

    const text = result.text?.trim();
    if (!text) {
      throw new Error("Gemini returned empty response");
    }

    return text;
  }
}
