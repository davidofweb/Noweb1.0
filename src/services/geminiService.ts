import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export interface Business {
  name: string;
  address: string;
  phone?: string;
  category: string;
  hasWebsite: boolean;
  socialMedia?: {
    instagram?: string;
    facebook?: string;
    whatsapp?: string;
  };
  attributes?: {
    isOpen?: boolean;
    delivery?: boolean;
    reservations?: boolean;
    outdoorSeating?: boolean;
  };
  notes?: string;
}

export async function searchBusinessesWithoutWebsites(category: string, location: string): Promise<Business[]> {
  const prompt = `Find 10 ${category} businesses in ${location} that do not have an official website. 
  Verify this using Google Search. 
  Return the results as a JSON array of objects with the following properties:
  - name: string
  - address: string
  - phone: string (optional)
  - category: string
  - hasWebsite: boolean (should be false)
  - socialMedia: object (optional, include links to instagram, facebook, or whatsapp if found)
  - attributes: object with booleans: isOpen, delivery, reservations, outdoorSeating
  - notes: string (briefly explain why they might not have a website or what was found)
  
  Only include businesses that definitely do not have a website.`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              address: { type: Type.STRING },
              phone: { type: Type.STRING },
              category: { type: Type.STRING },
              hasWebsite: { type: Type.BOOLEAN },
              socialMedia: {
                type: Type.OBJECT,
                properties: {
                  instagram: { type: Type.STRING },
                  facebook: { type: Type.STRING },
                  whatsapp: { type: Type.STRING },
                },
              },
              attributes: {
                type: Type.OBJECT,
                properties: {
                  isOpen: { type: Type.BOOLEAN },
                  delivery: { type: Type.BOOLEAN },
                  reservations: { type: Type.BOOLEAN },
                  outdoorSeating: { type: Type.BOOLEAN },
                },
              },
              notes: { type: Type.STRING },
            },
            required: ["name", "address", "category", "hasWebsite"],
          },
        },
        tools: [{ googleSearch: {} }],
      },
    });

    const text = response.text;
    if (!text) return [];
    return JSON.parse(text);
  } catch (error) {
    console.error("Error searching businesses:", error);
    return [];
  }
}
