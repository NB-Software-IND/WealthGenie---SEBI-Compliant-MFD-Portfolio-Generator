
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
    2. Check if the User Selected Tax Slab correctly matches the "Financial Base" of ₹${totalFinancialBase} based on standard Indian New Tax Regime slabs.
    
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

  return JSON.parse(response.text || '{"isValid": false, "errorMessage": "Validation failed", "warnings": [], "suggestedTaxSlab": null}');
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
 * Calculates suggested investment amounts based on surplus and generates a suitability narrative.
 */
export const getPortfolioSummary = async (financial: FinancialDetails, personal: PersonalDetails): Promise<PortfolioSummary> => {
  const insuranceMonthly = (financial.insurance.termPlan + financial.insurance.healthInsurance + financial.insurance.personalAccident) / 12;
  const amortizedYearly = financial.yearlyExpenses / 12;
  
  const prompt = `
    As a Senior Financial Planner, calculate recommended SIP and Lumpsum for ${personal.name} (Age: ${personal.age}):
    - Monthly Inflow: ₹${financial.monthlyIncome}
    - Total Outflow: ₹${(financial.monthlyExpenses + amortizedYearly + insuranceMonthly).toFixed(2)}
    - Investible Corpus: ₹${financial.totalCorpusToInvest}

    STRICT RULES:
    1. Emergency Buffer: 10-15% of Inflow.
    2. SIP = Surplus - Buffer.
    3. Lumpsum = 80% of Corpus.
    
    Also, generate a 3-sentence "Suitability Narrative" for SEBI compliance explaining WHY this asset allocation fits their profile.
    
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
          suitabilityNarrative: { type: Type.STRING },
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
        required: ["investableFromSalary", "investableFromSalaryWords", "investableFromCorpus", "investableFromCorpusWords", "breakdown", "reasoning", "suitabilityNarrative"]
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
  const prompt = `Convert the number ${amount} to Indian numbering system words (Rupees). Just return the string.`;
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
  required: ["name", "category", "performance", "riskMetrics", "benchmark", "aum"]
};

export const getRecommendedSchemes = async (profile: RiskProfile, age: number, investment: any, riskAnswers: Record<number, number>): Promise<RecommendedScheme[]> => {
  const horizonScore = riskAnswers[3] || 4; 
  const isShortHorizon = horizonScore <= 2; 

  const prompt = `
    Generate exactly 5 distinct Mutual Fund recommendations for ${profile.category} risk, Age ${age}.
    
    ### SEBI-AMFI COMPLIANCE SAFETY VALVES:
    1. HORIZON GUARDRAIL: If Goal Horizon < 3 years (Status: ${isShortHorizon ? 'YES' : 'NO'}), Total Equity exposure MUST NOT exceed 20%. Use Debt/Liquid/Low-Duration funds instead.
    2. INTERNATIONAL EXIT: If Age > 45, NO International funds (Remove currency volatility risk).
    3. QUALITY FILTER: NO Credit Risk, Sectoral, Thematic, or Contra funds. Cap "Focused Funds" at 10% weightage.
    4. EQUITY GLIDE PATH: Equity % must reduce as age increases.
    
    ### ASSET ALLOCATION TARGETS FOR AGE ${age}:
    - Use appropriate Mix of: Active Equity, LC Index, Gold, Intl (only if < 45), and Debt (Liquid/Ultra-Short/Corp Bond).
    
    ### OUTPUT:
    - 5 schemes with 100% total allocation.
    - 4 alternatives per scheme (same category).
    - Regular Growth plans ONLY.
  `;

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
  const prompt = `Detect and resolve any duplicate fund names or high-overlap fund categories in this portfolio: ${JSON.stringify(currentPortfolio.map(s => s.name))}.
    Maintain the same risk profile (${profile.category}) and return 5 distinct high-quality funds.`;

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
