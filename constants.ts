
export const TAX_SLABS = [
  { range: "Up to ₹3,00,000", rate: "Nil" },
  { range: "₹3,00,001 - ₹7,00,000", rate: "5%" },
  { range: "₹7,00,001 - ₹10,00,000", rate: "10%" },
  { range: "₹10,00,001 - ₹12,00,000", rate: "15%" },
  { range: "₹12,00,001 - ₹15,00,000", rate: "20%" },
  { range: "Above ₹15,00,000", rate: "30%" },
];

export const RISK_QUESTIONS = [
  {
    id: 1,
    question: "What is your primary investment goal?",
    options: [
      { text: "Capital Preservation (Protect what I have)", score: 1 },
      { text: "Regular Income (Pension/Rent style)", score: 2 },
      { text: "Moderate Growth", score: 3 },
      { text: "Aggressive Wealth Creation", score: 4 },
    ],
  },
  {
    id: 2,
    question: "How would you react if your portfolio dropped by 20% in 6 months?",
    options: [
      { text: "Sell everything immediately", score: 1 },
      { text: "Sell part of the portfolio", score: 2 },
      { text: "Wait and hold for recovery", score: 3 },
      { text: "Buy more at lower prices", score: 4 },
    ],
  },
  {
    id: 3,
    question: "What is your intended investment horizon?",
    options: [
      { text: "Less than 1 year", score: 1 },
      { text: "1 - 3 years", score: 2 },
      { text: "3 - 5 years", score: 3 },
      { text: "More than 5 years", score: 4 },
    ],
  },
  {
    id: 4,
    question: "How familiar are you with Mutual Fund risks?",
    options: [
      { text: "Not familiar at all", score: 1 },
      { text: "Know about Debt/Bank FD", score: 2 },
      { text: "Familiar with Equities/Market ups & downs", score: 3 },
      { text: "Expert level understanding", score: 4 },
    ],
  },
];
