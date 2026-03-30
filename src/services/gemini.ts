import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function analyzeStock(products: any[]) {
  const lowStock = products.filter(p => p.stockQuantity <= p.minStockLevel);
  if (lowStock.length === 0) return "Le stock est optimal pour tous les produits.";

  const prompt = `En tant qu'expert en gestion de stock, analyse ces produits en rupture ou stock faible : ${JSON.stringify(lowStock)}. Donne des conseils courts et précis pour le réapprovisionnement.`;
  
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
    });
    return response.text;
  } catch (error) {
    console.error("Gemini Error:", error);
    return "Erreur lors de l'analyse du stock.";
  }
}

export async function analyzeCredits(clients: any[]) {
  const highCredit = clients.filter(c => c.totalCredit > 0).sort((a, b) => b.totalCredit - a.totalCredit);
  if (highCredit.length === 0) return "Aucun crédit en cours.";

  const prompt = `Analyse ces clients ayant des crédits : ${JSON.stringify(highCredit)}. Suggère une stratégie de recouvrement pour les 3 plus gros crédits.`;
  
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
    });
    return response.text;
  } catch (error) {
    console.error("Gemini Error:", error);
    return "Erreur lors de l'analyse des crédits.";
  }
}
