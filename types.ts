
export type IncomeStatus = 'Earning' | 'Retired';

export interface PersonalDetails {
  name: string;
  dob: string;
  age: number;
  mobile: string;
  email: string;
}

export interface InsuranceDetails {
  termPlan: number;
  healthInsurance: number;
  personalAccident: number;
}

export interface FinancialDetails {
  incomeStatus: IncomeStatus;
  hasCorpus: boolean;
  hasPension: boolean;
  totalCorpusToInvest: number;
  monthlyIncome: number;
  monthlyExpenses: number;
  yearlyExpenses: number;
  insurance: InsuranceDetails;
  taxSlab: string;
}

export interface RiskProfile {
  category: 'Low' | 'Moderately Low' | 'Moderate' | 'Moderately High' | 'High' | 'Very High';
  description: string;
}

export interface InvestmentInput {
  sipAmount: number;
  lumpsumAmount: number;
  type: 'SIP' | 'Lumpsum' | 'Both';
}

export interface CalculationGranularDetails {
  totalMonthlyInflow: number;
  totalMonthlyOutflow: number;
  insuranceImpactMonthly: number;
  amortizedYearlyExpensesMonthly: number;
  emergencyBuffer: number;
  surplusBeforeInvestment: number;
}

export interface PortfolioSummary {
  investableFromSalary: number;
  investableFromSalaryWords: string;
  investableFromCorpus: number;
  investableFromCorpusWords: string;
  totalInvestable: number;
  reasoning: string;
  breakdown: CalculationGranularDetails;
}

export interface SchemePerformance {
  alpha: number;
  cagr3y: number;
  cagr5y: number;
  cagr10y: number;
  rollingReturn: number;
  benchmarkReturn5y: number;
}

export interface SchemeRisk {
  trackingError: number;
  sebiRisk: string;
  maxDrawdown: number;
  volatility: number;
  stdDev: number;
  beta: number;
}

export interface SchemeOption {
  name: string;
  category: string;
  benchmark: string;
  expenseRatio: number;
  managerTenure: string;
  aum: number;
  performance: SchemePerformance;
  riskMetrics: SchemeRisk;
}

export interface RecommendedScheme extends SchemeOption {
  sipAllocationPct: number;
  lumpsumAllocationPct: number;
  alternatives: SchemeOption[];
}
