
import { GoogleGenAI, Type } from "@google/genai";
import { PersonalDetails, FinancialDetails, RiskProfile, RecommendedScheme, PortfolioSummary } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

/**
 * Validates financial health using AI logic.
 */
export const validateFinancialHealth = async (personal: PersonalDetails, financial: FinancialDetails) => {
  const insuranceMonthly = (financial.insurance.termPlan + financial.insurance.healthInsurance + financial.insurance.personalAccident) / 12;
  const totalMonthlyOutflow = financial.monthlyExpenses + (financial.yearlyExpenses / 12) + insuranceMonthly;
  const annualSalaryIncome = financial.monthlyIncome * 12;
  const totalFinancialBase = annualSalaryIncome + (financial.totalCorpusToInvest || 0);
  
  const prompt = `
    Analyze financial data for Mutual Fund recommendation (SEBI-AMFI Compliance).
    Details: ${JSON.stringify(financial)}
    Monthly Inflow: ₹${financial.monthlyIncome}
    Annual Salary Inflow: ₹${annualSalaryIncome}
    Total Investible Corpus: ₹${financial.totalCorpusToInvest}
    Financial Base for Tax Calculation (Annual Salary + Total Corpus): ₹${totalFinancialBase}
    User Selected Tax Slab: ${financial.taxSlab}
    Total Monthly Outflow (Expenses + Amortized Yearly + Insurance): ₹${totalMonthlyOutflow.toFixed(2)}
    
    CHECK FOR CONTRADICTIONS:
    1. Monthly Income < Total Monthly Outflow. (This is a FATAL error).
    2. Check if the User Selected Tax Slab correctly matches the "Financial Base" of ₹${totalFinancialBase} based on standard Indian New Tax Regime slabs:
       - Nil: Up to 3L
       - 5%: 3-7L
       - 10%: 7-10L
       - 15%: 10-12L
       - 20%: 12-15L
       - 30%: Above 15L
    
    SPECIAL RULE FOR TAX SLAB:
    - If the User Selected Tax Slab is INCORRECT based on the Financial Base (₹${totalFinancialBase}), identify the correct one.
    - If ONLY the Tax Slab is incorrect, set "isValid" to TRUE, but provide the "suggestedTaxSlab".
    - If there are fatal contradictions (e.g., Inflow < Outflow), set "isValid" to FALSE.
    
    Return JSON:
    {
      "isValid": boolean,
      "errorMessage": string | null,
      "warnings": string[],
      "suggestedTaxSlab": string | null
    }
  `;

  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: prompt,
    config: { 
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          isValid: { type: Type.BOOLEAN },
          errorMessage: { type: Type.STRING, nullable: true },
          warnings: { type: Type.ARRAY, items: { type: Type.STRING } },
          suggestedTaxSlab: { type: Type.STRING, nullable: true }
        },
        required: ["isValid", "errorMessage", "warnings", "suggestedTaxSlab"]
      }
    }
  });

  const result = JSON.parse(response.text || '{"isValid": false, "errorMessage": "Validation failed", "warnings": [], "suggestedTaxSlab": null}');
  return result;
};

/**
 * Calculates risk profile based on score and age.
 * Enforces SEBI-compliant descriptions.
 */
export const calculateRiskProfile = async (score: number, age: number): Promise<RiskProfile> => {
  const prompt = `Calculate a strictly SEBI-AMFI compliant Mutual Fund risk profile for a person aged ${age} with a psychological risk score of ${score}/16. 
    Map this to one of: Low, Moderately Low, Moderate, Moderately High, High, Very High.
    
    The description MUST be structured as:
    1. Principal Risk: (e.g., 'Principal at very high risk')
    2. Suitable for: (Who should invest)
    3. Horizon: (Recommended time frame)
    
    Ensure the tone is professional yet easy to understand for a retail investor.
    Return JSON with category and a professional description.`;
    
  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: prompt,
    config: { 
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          category: { type: Type.STRING },
          description: { type: Type.STRING }
        },
        required: ["category", "description"]
      }
    }
  });
  return JSON.parse(response.text || '{}');
};

/**
 * Calculates suggested investment amounts based on surplus.
 */
export const getPortfolioSummary = async (financial: FinancialDetails): Promise<PortfolioSummary> => {
  const insuranceMonthly = (financial.insurance.termPlan + financial.insurance.healthInsurance + financial.insurance.personalAccident) / 12;
  const amortizedYearly = financial.yearlyExpenses / 12;
  
  const prompt = `
    As a Senior Financial Planner, calculate the recommended SIP and Lumpsum amounts for a salaried/retired individual:
    
    INPUT DATA:
    - Monthly Inflow (Salary/Pension): ₹${financial.monthlyIncome}
    - Direct Monthly Expenses: ₹${financial.monthlyExpenses}
    - Amortized Yearly Expenses (Monthly equivalent): ₹${amortizedYearly.toFixed(2)}
    - Insurance Premiums (Monthly equivalent): ₹${insuranceMonthly.toFixed(2)}
    - Investible Corpus (Available Lumpsum): ₹${financial.totalCorpusToInvest}

    STRICT ARITHMETIC RULES:
    1. Total Monthly Outflow = (Direct Monthly Expenses + Amortized Yearly Expenses + Monthly Insurance Premiums).
    2. Gross Surplus = Monthly Inflow - Total Monthly Outflow.
    3. Mandatory Emergency Buffer = 10% of Gross Surplus OR 15% of Monthly Inflow (whichever is more conservative).
    4. Recommended SIP = Gross Surplus - Emergency Buffer. (If result < 0, set to 0).
    5. Recommended Lumpsum = Minimum of (Investible Corpus) and (80% of Investible Corpus to keep 20% liquid).

    Convert all final calculated amounts to Indian Numbering System words.
    
    Return JSON matching the PortfolioSummary structure precisely.
  `;

  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: prompt,
    config: { 
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          investableFromSalary: { type: Type.NUMBER },
          investableFromSalaryWords: { type: Type.STRING },
          investableFromCorpus: { type: Type.NUMBER },
          investableFromCorpusWords: { type: Type.STRING },
          totalInvestable: { type: Type.NUMBER },
          reasoning: { type: Type.STRING },
          breakdown: {
            type: Type.OBJECT,
            properties: {
              totalMonthlyInflow: { type: Type.NUMBER },
              totalMonthlyOutflow: { type: Type.NUMBER },
              insuranceImpactMonthly: { type: Type.NUMBER },
              amortizedYearlyExpensesMonthly: { type: Type.NUMBER },
              emergencyBuffer: { type: Type.NUMBER },
              surplusBeforeInvestment: { type: Type.NUMBER }
            },
            required: ["totalMonthlyInflow", "totalMonthlyOutflow", "surplusBeforeInvestment"]
          }
        },
        required: ["investableFromSalary", "investableFromSalaryWords", "investableFromCorpus", "investableFromCorpusWords", "breakdown", "reasoning"]
      }
    }
  });
  return JSON.parse(response.text || '{}');
};

/**
 * Utility to get amount in words via AI.
 */
export const getAmountInWords = async (amount: number): Promise<string> => {
  if (!amount || amount <= 0) return "";
  const prompt = `Convert the number ${amount} to Indian numbering system words (Rupees). Just return the string. Do not add any conversational filler.`;
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: prompt
  });
  return (response.text || "").trim();
};

const schemeSchema = {
  type: Type.OBJECT,
  properties: {
    name: { type: Type.STRING },
    category: { type: Type.STRING },
    benchmark: { type: Type.STRING },
    expenseRatio: { type: Type.NUMBER },
    managerTenure: { type: Type.STRING },
    aum: { type: Type.NUMBER },
    performance: {
      type: Type.OBJECT,
      properties: {
        alpha: { type: Type.NUMBER },
        cagr3y: { type: Type.NUMBER },
        cagr5y: { type: Type.NUMBER },
        cagr10y: { type: Type.NUMBER },
        rollingReturn: { type: Type.NUMBER },
        benchmarkReturn5y: { type: Type.NUMBER }
      },
      required: ["cagr5y", "benchmarkReturn5y"]
    },
    riskMetrics: {
      type: Type.OBJECT,
      properties: {
        trackingError: { type: Type.NUMBER },
        sebiRisk: { type: Type.STRING },
        maxDrawdown: { type: Type.NUMBER },
        volatility: { type: Type.NUMBER },
        stdDev: { type: Type.NUMBER },
        beta: { type: Type.NUMBER }
      },
      required: ["maxDrawdown", "volatility", "beta", "sebiRisk"]
    }
  },
  required: ["name", "category", "performance", "riskMetrics", "benchmark"]
};

export const getRecommendedSchemes = async (profile: RiskProfile, age: number, investment: any): Promise<RecommendedScheme[]> => {
  const prompt = `Recommend exactly 5 distinct Growth Regular Mutual Funds optimized for a "${profile.category}" risk profile. 
    Each scheme's 'sebiRisk' MUST follow the standard SEBI Risk-o-meter labels: Low, Moderately Low, Moderate, Moderately High, High, Very High.
    Sum of allocation Pcts must be exactly 100. Provide exactly 4 high-quality alternative schemes per slot from the same category.`;

  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: prompt,
    config: { 
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          ...schemeSchema,
          properties: {
            ...schemeSchema.properties,
            sipAllocationPct: { type: Type.NUMBER },
            lumpsumAllocationPct: { type: Type.NUMBER },
            alternatives: { type: Type.ARRAY, items: schemeSchema }
          },
          required: [...schemeSchema.required, "sipAllocationPct", "lumpsumAllocationPct", "alternatives"]
        }
      }
    }
  });
  return JSON.parse(response.text || '[]');
};

export const resolvePortfolioOverlaps = async (currentPortfolio: RecommendedScheme[], profile: RiskProfile): Promise<RecommendedScheme[]> => {
  const prompt = `Re-optimize the following portfolio to remove duplicate funds while maintaining the exact same category structure and ensuring 100% allocation sum.
    Ensure all risk labels ('sebiRisk') are accurate based on current AMFI data: ${JSON.stringify(currentPortfolio.map(s => s.name))}`;

  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: prompt,
    config: { 
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          ...schemeSchema,
          properties: {
            ...schemeSchema.properties,
            sipAllocationPct: { type: Type.NUMBER },
            lumpsumAllocationPct: { type: Type.NUMBER },
            alternatives: { type: Type.ARRAY, items: schemeSchema }
          },
          required: [...schemeSchema.required, "sipAllocationPct", "lumpsumAllocationPct", "alternatives"]
        }
      }
    }
  });
  return JSON.parse(response.text || '[]');
};
