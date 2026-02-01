
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Card, Input, Button } from './components/UI';
import { 
  PersonalDetails, 
  FinancialDetails, 
  RiskProfile, 
  InvestmentInput, 
  RecommendedScheme,
  PortfolioSummary,
  SchemeOption
} from './types';
import { TAX_SLABS, RISK_QUESTIONS } from './constants';
import { 
  validateFinancialHealth, 
  calculateRiskProfile, 
  getRecommendedSchemes,
  getPortfolioSummary,
  getAmountInWords,
  resolvePortfolioOverlaps
} from './services/geminiService';

declare var html2pdf: any;

const DRAFT_KEY = 'wealthgenie_draft_v1';

const App: React.FC = () => {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiCorrection, setAiCorrection] = useState<string | null>(null);
  const [hasDraft, setHasDraft] = useState(false);
  const [editingAllocationIdx, setEditingAllocationIdx] = useState<number | null>(null);
  const [aumSortOrder, setAumSortOrder] = useState<Record<number, 'none' | 'desc' | 'asc'>>({});
  const reportRef = useRef<HTMLDivElement>(null);

  // Form States
  const [personal, setPersonal] = useState<PersonalDetails>({
    name: '', dob: '', age: 0, mobile: '', email: ''
  });
  const [financial, setFinancial] = useState<FinancialDetails>({
    incomeStatus: 'Earning',
    hasCorpus: false,
    hasPension: false,
    totalCorpusToInvest: 0,
    monthlyIncome: 0,
    monthlyExpenses: 0,
    yearlyExpenses: 0,
    insurance: { termPlan: 0, healthInsurance: 0, personalAccident: 0 },
    taxSlab: TAX_SLABS[0].range
  });
  const [riskAnswers, setRiskAnswers] = useState<Record<number, number>>({});
  const [riskProfile, setRiskProfile] = useState<RiskProfile | null>(null);
  const [investment, setInvestment] = useState<InvestmentInput>({
    sipAmount: 0, lumpsumAmount: 0, type: 'SIP'
  });
  const [recommendations, setRecommendations] = useState<RecommendedScheme[]>([]);
  const [portfolioSummary, setPortfolioSummary] = useState<PortfolioSummary | null>(null);

  const [expandedRisk, setExpandedRisk] = useState<Record<string, boolean>>({});
  
  // Word conversion states
  const [sipWords, setSipWords] = useState<string>("");
  const [lumpsumWords, setLumpsumWords] = useState<string>("");
  const [corpusWords, setCorpusWords] = useState<string>("");
  const [incomeWords, setIncomeWords] = useState<string>("");
  
  const sipTimeoutRef = useRef<any>(null);
  const lumpsumTimeoutRef = useRef<any>(null);
  const corpusTimeoutRef = useRef<any>(null);
  const incomeTimeoutRef = useRef<any>(null);

  // Overlap Detection Memo
  const overlapsMap = useMemo(() => {
    const counts: Record<string, number> = {};
    recommendations.forEach(r => {
      if (r?.name) {
        counts[r.name] = (counts[r.name] || 0) + 1;
      }
    });
    return counts;
  }, [recommendations]);

  const hasAnyOverlap = useMemo(() => Object.values(overlapsMap).some((count: unknown) => (count as number) > 1), [overlapsMap]);

  // Allocation Sum validation
  const allocationSums = useMemo(() => {
    return recommendations.reduce((acc, curr) => ({
      sip: acc.sip + (curr.sipAllocationPct || 0),
      lumpsum: acc.lumpsum + (curr.lumpsumAllocationPct || 0)
    }), { sip: 0, lumpsum: 0 });
  }, [recommendations]);

  // Check for existing draft on load
  useEffect(() => {
    const saved = localStorage.getItem(DRAFT_KEY);
    if (saved) {
      setHasDraft(true);
    }
  }, []);

  useEffect(() => {
    if (personal.dob) {
      const birth = new Date(personal.dob);
      const today = new Date();
      let age = today.getFullYear() - birth.getFullYear();
      const m = today.getMonth() - birth.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
      setPersonal(prev => ({ ...prev, age }));
    }
  }, [personal.dob]);

  // Debounced real-time word conversion
  useEffect(() => {
    if (investment.sipAmount > 0) {
      if (sipTimeoutRef.current) clearTimeout(sipTimeoutRef.current);
      sipTimeoutRef.current = setTimeout(async () => {
        const words = await getAmountInWords(investment.sipAmount);
        setSipWords(words);
      }, 600);
    } else {
      setSipWords("");
    }
  }, [investment.sipAmount]);

  useEffect(() => {
    if (investment.lumpsumAmount > 0) {
      if (lumpsumTimeoutRef.current) clearTimeout(lumpsumTimeoutRef.current);
      lumpsumTimeoutRef.current = setTimeout(async () => {
        const words = await getAmountInWords(investment.lumpsumAmount);
        setLumpsumWords(words);
      }, 600);
    } else {
      setLumpsumWords("");
    }
  }, [investment.lumpsumAmount]);

  useEffect(() => {
    if (financial.totalCorpusToInvest > 0) {
      if (corpusTimeoutRef.current) clearTimeout(corpusTimeoutRef.current);
      corpusTimeoutRef.current = setTimeout(async () => {
        const words = await getAmountInWords(financial.totalCorpusToInvest);
        setCorpusWords(words);
      }, 600);
    } else {
      setCorpusWords("");
    }
  }, [financial.totalCorpusToInvest]);

  useEffect(() => {
    if (financial.monthlyIncome > 0) {
      if (incomeTimeoutRef.current) clearTimeout(incomeTimeoutRef.current);
      incomeTimeoutRef.current = setTimeout(async () => {
        const words = await getAmountInWords(financial.monthlyIncome);
        setIncomeWords(words);
      }, 600);
    } else {
      setIncomeWords("");
    }
  }, [financial.monthlyIncome]);

  const saveDraft = () => {
    const data = {
      step,
      personal,
      financial,
      riskAnswers,
      riskProfile,
      investment,
      recommendations,
      portfolioSummary
    };
    localStorage.setItem(DRAFT_KEY, JSON.stringify(data));
    alert("Draft saved successfully to local storage!");
    setHasDraft(true);
  };

  const loadDraft = () => {
    const saved = localStorage.getItem(DRAFT_KEY);
    if (!saved) return;
    try {
      const data = JSON.parse(saved);
      setStep(data.step || 1);
      setPersonal(data.personal);
      setFinancial(data.financial);
      setRiskAnswers(data.riskAnswers);
      setRiskProfile(data.riskProfile);
      setInvestment(data.investment);
      setRecommendations(data.recommendations || []);
      setPortfolioSummary(data.portfolioSummary);
      setHasDraft(false);
    } catch (e) {
      console.error("Failed to load draft", e);
      setError("Failed to load saved draft. It might be corrupted.");
    }
  };

  const handlePersonalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!personal.mobile.match(/^[0-9]{10}$/)) {
      setError("Please enter a valid 10-digit mobile number.");
      return;
    }
    if (!personal.email.includes("@")) {
      setError("Please enter a valid email address.");
      return;
    }
    setError(null);
    setStep(2);
  };

  const handleFinancialSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setAiCorrection(null);
    try {
      const validation = await validateFinancialHealth(personal, financial);
      
      // Handle AI Tax Slab Correction
      if (validation.suggestedTaxSlab && validation.suggestedTaxSlab !== financial.taxSlab) {
        setFinancial(prev => ({ ...prev, taxSlab: validation.suggestedTaxSlab! }));
        setAiCorrection(`AI Correction: Tax Slab was adjusted to "${validation.suggestedTaxSlab}" based on your income.`);
      }

      if (!validation.isValid) {
        setError(validation.errorMessage);
        setLoading(false);
        return;
      }
      
      setStep(3);
    } catch (err) {
      setError("AI Analysis failed. Please check inputs.");
    } finally {
      setLoading(false);
    }
  };

  const handleRiskSubmit = async () => {
    if (Object.keys(riskAnswers).length < RISK_QUESTIONS.length) {
      setError("Please answer all questions.");
      return;
    }
    setLoading(true);
    try {
      const totalScore = (Object.values(riskAnswers) as number[]).reduce((a, b) => a + b, 0);
      const profile = await calculateRiskProfile(totalScore, personal.age);
      const summary = await getPortfolioSummary(financial);
      setRiskProfile(profile);
      setPortfolioSummary(summary);
      setInvestment(prev => ({
        ...prev,
        sipAmount: summary?.investableFromSalary || 0,
        lumpsumAmount: summary?.investableFromCorpus || 0
      }));
      setStep(4);
    } catch (err) {
      setError("Failed to calculate risk profile. AI response was invalid.");
    } finally {
      setLoading(false);
    }
  };

  const handleFinalSubmit = async () => {
    setLoading(true);
    try {
      if (!riskProfile) return;
      const data = await getRecommendedSchemes(riskProfile, personal.age, investment);
      setRecommendations(data || []);
      setStep(5);
    } catch (err) {
      setError("Failed to generate recommendations. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleSchemeChange = (index: number, newName: string) => {
    const slot = recommendations[index];
    if (!slot) return;
    const alternatives = slot.alternatives || [];
    const chosen = [slot, ...alternatives].find(s => s?.name === newName);
    if (!chosen) return;

    const willOverlap = recommendations.some((r, rIdx) => rIdx !== index && r?.name === newName);
    if (willOverlap) {
      if (!confirm(`Warning: Choosing "${newName}" will result in a fund overlap in your portfolio. Overlap reduces diversification. Proceed anyway?`)) {
        return;
      }
    }

    const updated = [...recommendations];
    updated[index] = {
      ...chosen,
      sipAllocationPct: slot.sipAllocationPct,
      lumpsumAllocationPct: slot.lumpsumAllocationPct,
      alternatives: [slot, ...alternatives].filter(s => s?.name !== newName) as SchemeOption[]
    };
    setRecommendations(updated);
  };

  const handleAllocationOverride = (index: number, type: 'sip' | 'lumpsum', value: number) => {
    const updated = [...recommendations];
    if (type === 'sip') {
      updated[index].sipAllocationPct = value;
    } else {
      updated[index].lumpsumAllocationPct = value;
    }
    setRecommendations(updated);
  };

  const fixOverlapsWithAI = async () => {
    if (!riskProfile) return;
    setLoading(true);
    try {
      const optimized = await resolvePortfolioOverlaps(recommendations, riskProfile);
      if (optimized && optimized.length === 5) {
        setRecommendations(optimized);
      }
    } catch (err) {
      setError("AI re-optimization failed.");
    } finally {
      setLoading(false);
    }
  };

  const generateReport = async () => {
    if (!reportRef.current) return;
    setLoading(true);
    const element = reportRef.current;
    const opt = {
      margin: [10, 10],
      filename: `WealthGenie_Portfolio_${personal.name.replace(/\s+/g, '_')}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, letterRendering: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };
    try {
      await html2pdf().set(opt).from(element).save();
    } catch (err) {
      console.error("PDF generation error:", err);
      alert("Error generating PDF.");
    } finally {
      setLoading(false);
    }
  };

  const toggleRisk = (name: string) => {
    setExpandedRisk(prev => ({ ...prev, [name]: !prev[name] }));
  };

  const toggleAumSort = (idx: number) => {
    setAumSortOrder(prev => {
      const current = prev[idx] || 'none';
      const nextOrder: 'none' | 'desc' | 'asc' = current === 'none' ? 'desc' : current === 'desc' ? 'asc' : 'none';
      return { ...prev, [idx]: nextOrder };
    });
  };

  const getRiskColor = (risk: string) => {
    const r = risk.toLowerCase();
    if (r.includes('very high')) return 'bg-rose-100 text-rose-700 border-rose-200';
    if (r.includes('high')) return 'bg-orange-100 text-orange-700 border-orange-200';
    if (r.includes('moderately high')) return 'bg-yellow-100 text-yellow-700 border-yellow-200';
    if (r.includes('moderate')) return 'bg-blue-100 text-blue-700 border-blue-200';
    if (r.includes('low')) return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    return 'bg-slate-100 text-slate-700 border-slate-200';
  };

  const SchemePerformanceComparison = ({ fund = 0, bench = 0, benchName = "Benchmark" }: { fund?: number, bench?: number, benchName?: string }) => {
    const safeFund = typeof fund === 'number' ? fund : 0;
    const safeBench = typeof bench === 'number' ? bench : 0;
    const max = Math.max(safeFund, safeBench, 20);
    const fundPct = (safeFund / max) * 100;
    const benchPct = (safeBench / max) * 100;
    
    return (
      <div className="flex flex-col gap-1 w-full max-w-[120px]">
        <div className="flex items-center gap-1.5 h-2">
          <div className="flex-1 h-full bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-blue-600 rounded-full" style={{ width: `${fundPct}%` }}></div>
          </div>
          <span className="text-[8px] font-black text-blue-700 min-w-[24px]">{safeFund}%</span>
        </div>
        <div className="flex items-center gap-1.5 h-2">
          <div className="flex-1 h-full bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-slate-400 rounded-full" style={{ width: `${benchPct}%` }}></div>
          </div>
          <span className="text-[8px] font-bold text-slate-500 min-w-[24px]">{safeBench}%</span>
        </div>
        <p className="text-[6px] uppercase font-black tracking-tighter text-slate-400 truncate">vs {benchName}</p>
      </div>
    );
  };

  return (
    <div className="min-h-screen py-12 px-4 flex items-center justify-center bg-slate-50">
      <div className="w-full max-w-5xl">
        
        {/* Progress Bar & Actions */}
        <div className="mb-10 max-w-3xl mx-auto flex flex-col gap-6 print:hidden">
          <div className="flex justify-between items-center">
             <div className="flex gap-4">
               {[1, 2, 3, 4, 5].map((s) => (
                  <div key={s} className="flex flex-col items-center">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-black text-sm transition-all duration-500 ${step >= s ? 'bg-blue-600 text-white shadow-xl scale-110 ring-4 ring-blue-100' : 'bg-white text-slate-300 border-2 border-slate-200'}`}>
                      {s}
                    </div>
                  </div>
                ))}
             </div>
             <div className="flex gap-2">
                {hasDraft && step === 1 && (
                  <Button onClick={loadDraft} variant="secondary" className="!px-4 !py-2 !text-[10px] !bg-blue-50 hover:!bg-blue-100 !text-blue-700">Resume Session</Button>
                )}
                {step > 1 && (
                  <Button onClick={saveDraft} variant="secondary" className="!px-4 !py-2 !text-[10px] !bg-slate-100 hover:!bg-slate-200">Save Draft</Button>
                )}
             </div>
          </div>
          <div className="flex justify-between px-2">
             {['Personal', 'Financial', 'Risk', 'Invest', 'Report'].map((label, i) => (
                <span key={label} className={`text-[10px] font-black uppercase tracking-widest ${step >= i + 1 ? 'text-blue-600' : 'text-slate-400'}`}>{label}</span>
             ))}
          </div>
        </div>

        {error && (
          <div className="mb-6 p-5 bg-rose-50 border-2 border-rose-100 text-rose-800 rounded-2xl text-sm font-bold text-center animate-bounce shadow-sm">
            ⚠️ {error}
          </div>
        )}

        {aiCorrection && (
          <div className="mb-6 p-4 bg-blue-50 border-2 border-blue-200 text-blue-800 rounded-2xl text-xs font-black text-center animate-in fade-in slide-in-from-top-4 duration-500 shadow-sm flex items-center justify-center gap-3">
            <span className="text-xl">🤖</span> {aiCorrection}
          </div>
        )}

        {step === 1 && (
          <Card title="Step 1: Personal Details">
            <form onSubmit={handlePersonalSubmit} className="space-y-6">
              <Input label="Name (As per PAN)" value={personal.name} onChange={v => setPersonal({...personal, name: v})} required tooltip="Exactly as it appears on your identity documents." />
              <div className="flex gap-4">
                <div className="flex-1">
                  <Input label="Date of Birth" type="date" value={personal.dob} onChange={v => setPersonal({...personal, dob: v})} required />
                </div>
                <div className="w-24">
                  <Input label="Age" type="number" value={personal.age} onChange={()=>{}} disabled tooltip="Calculated automatically from DOB." />
                </div>
              </div>
              <Input label="Mobile Number" value={personal.mobile} onChange={v => setPersonal({...personal, mobile: v})} placeholder="10-digit mobile" required tooltip="Used for communication and KYC validation." />
              <Input label="Email ID" type="email" value={personal.email} onChange={v => setPersonal({...personal, email: v})} required tooltip="Your primary contact for portfolio reports." />
              <div className="flex justify-center pt-4">
                <Button type="submit" className="w-full py-4 text-base tracking-widest uppercase">Next: Financial Profile</Button>
              </div>
            </form>
          </Card>
        )}

        {step === 2 && (
          <Card title="Step 2: Financial Profile">
            <form onSubmit={handleFinancialSubmit} className="space-y-6">
              <div className="flex gap-4 mb-4">
                <button type="button" onClick={() => setFinancial({...financial, incomeStatus: 'Earning'})} className={`flex-1 py-4 rounded-2xl border-2 font-black uppercase tracking-widest transition-all ${financial.incomeStatus === 'Earning' ? 'border-blue-600 bg-blue-600 text-white shadow-lg' : 'border-slate-200 bg-white text-slate-400 hover:border-slate-300'}`}>Earning</button>
                <button type="button" onClick={() => setFinancial({...financial, incomeStatus: 'Retired'})} className={`flex-1 py-4 rounded-2xl border-2 font-black uppercase tracking-widest transition-all ${financial.incomeStatus === 'Retired' ? 'border-blue-600 bg-blue-600 text-white shadow-lg' : 'border-slate-200 bg-white text-slate-400 hover:border-slate-300'}`}>Retired</button>
              </div>
              {financial.incomeStatus === 'Retired' && (
                <div className="p-6 bg-blue-50/50 rounded-2xl space-y-5 border border-blue-100 shadow-inner">
                  <p className="text-xs font-black text-blue-900 uppercase tracking-widest">Retirement Specifics</p>
                  <div className="flex gap-4">
                    <label className="flex-1 flex items-center gap-3 p-4 bg-white rounded-xl border border-blue-200 cursor-pointer hover:shadow-md transition-all">
                      <input type="checkbox" className="w-5 h-5 text-blue-600 rounded-lg" checked={financial.hasCorpus} onChange={e => setFinancial({...financial, hasCorpus: e.target.checked})} />
                      <span className="text-xs font-black text-slate-700 uppercase">Available Corpus</span>
                    </label>
                    <label className="flex-1 flex items-center gap-3 p-4 bg-white rounded-xl border border-blue-200 cursor-pointer hover:shadow-md transition-all">
                      <input type="checkbox" className="w-5 h-5 text-blue-600 rounded-lg" checked={financial.hasPension} onChange={e => setFinancial({...financial, hasPension: e.target.checked})} />
                      <span className="text-xs font-black text-slate-700 uppercase">Pension/Monthly</span>
                    </label>
                  </div>
                  {financial.hasCorpus && (
                    <Input 
                      label="Total Corpus Value (₹)" 
                      type="number" 
                      value={financial.totalCorpusToInvest} 
                      onChange={v => setFinancial({...financial, totalCorpusToInvest: v})} 
                      required 
                      tooltip="Total amount available for immediate lumpsum investment."
                      helperText={corpusWords ? `Rupees: ${corpusWords}` : ""}
                    />
                  )}
                </div>
              )}
              <Input 
                label="Monthly Inflow (Salary/Pension) (₹)" 
                type="number" 
                value={financial.monthlyIncome} 
                onChange={v => setFinancial({...financial, monthlyIncome: v})} 
                disabled={financial.incomeStatus === 'Retired' && !financial.hasPension}
                required={!(financial.incomeStatus === 'Retired' && !financial.hasPension)}
                tooltip="Your net take-home monthly income."
                helperText={incomeWords ? `Rupees: ${incomeWords}` : ""}
              />
              <div className="grid grid-cols-2 gap-4">
                <Input label="Monthly Expenses (₹)" type="number" value={financial.monthlyExpenses} onChange={v => setFinancial({...financial, monthlyExpenses: v})} tooltip="Rent, food, utilities, etc." required />
                <Input label="Yearly Lump Expenses (₹)" type="number" value={financial.yearlyExpenses} onChange={v => setFinancial({...financial, yearlyExpenses: v})} tooltip="School fees, insurance premiums, taxes, etc." required />
              </div>
              <div className="bg-slate-50 p-6 rounded-2xl space-y-4 border border-slate-200">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-200 pb-2">Insurance Details (Annual Premiums)</p>
                <div className="grid grid-cols-3 gap-4">
                  <Input label="Term Life" type="number" value={financial.insurance.termPlan} onChange={v => setFinancial({...financial, insurance: {...financial.insurance, termPlan: v}})} tooltip="Pure protection life insurance." />
                  <Input label="Health" type="number" value={financial.insurance.healthInsurance} onChange={v => setFinancial({...financial, insurance: {...financial.insurance, healthInsurance: v}})} tooltip="Medical/Mediclaim coverage." />
                  <Input label="Personal Acc" type="number" value={financial.insurance.personalAccident} onChange={v => setFinancial({...financial, insurance: {...financial.insurance, personalAccident: v}})} tooltip="Accident and disability cover." />
                </div>
              </div>
              <div className="mb-4">
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Current Income Tax Slab</label>
                <select className="w-full p-3.5 border border-slate-300 rounded-xl font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500 bg-white" value={financial.taxSlab} onChange={e => setFinancial({...financial, taxSlab: e.target.value})}>
                  {TAX_SLABS.map(s => <option key={s.range} value={s.range}>{s.range} ({s.rate})</option>)}
                </select>
              </div>
              <div className="flex justify-center pt-4">
                <Button type="submit" disabled={loading} className="w-full py-4 tracking-widest uppercase">{loading ? 'AI Validating Profile...' : 'Next: Risk Questionnaire'}</Button>
              </div>
            </form>
          </Card>
        )}

        {step === 3 && (
          <Card title="Step 3: Risk Tolerance">
            <div className="space-y-8">
              {RISK_QUESTIONS.map((q) => (
                <div key={q.id} className="bg-white p-6 rounded-2xl border-2 border-slate-100 shadow-sm transition-all hover:border-blue-100">
                  <p className="font-black text-slate-900 text-lg mb-6 leading-snug">Q{q.id}. {q.question}</p>
                  <div className="grid grid-cols-1 gap-3">
                    {q.options.map((opt) => (
                      <button 
                        key={opt.text} 
                        onClick={() => setRiskAnswers({...riskAnswers, [q.id]: opt.score})} 
                        className={`text-left p-5 rounded-2xl border-2 text-sm font-black tracking-tight transition-all transform active:scale-[0.98] ${riskAnswers[q.id] === opt.score ? 'bg-blue-600 border-blue-600 text-white shadow-xl translate-x-1' : 'bg-slate-50 hover:bg-white border-slate-100 text-slate-600'}`}
                      >
                        {opt.text}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              <div className="flex justify-center pt-4">
                <Button onClick={handleRiskSubmit} disabled={loading} className="w-full py-4 tracking-widest uppercase shadow-2xl">{loading ? 'Analyzing Risk Horizon...' : 'Generate Investment Logic'}</Button>
              </div>
            </div>
          </Card>
        )}

        {step === 4 && riskProfile && portfolioSummary && (
          <Card title="Step 4: Investment Strategy">
            <div className="mb-8 grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="p-6 bg-emerald-50 rounded-[2rem] border-2 border-emerald-100 shadow-sm relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-3 text-emerald-200 font-black text-4xl group-hover:scale-125 transition-transform">₹</div>
                <p className="text-[10px] font-black text-emerald-600 uppercase mb-2 tracking-widest">Target Monthly SIP</p>
                <p className="text-4xl font-black text-emerald-900 leading-none mb-1">₹{(portfolioSummary.investableFromSalary || 0).toLocaleString()}</p>
                <p className="text-[9px] font-bold text-emerald-500 italic uppercase">
                  {(portfolioSummary.investableFromSalaryWords || "").replace(/^Rupees:\s*/i, "")}
                </p>
              </div>
              <div className="p-6 bg-blue-50 rounded-[2rem] border-2 border-blue-100 shadow-sm relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-3 text-blue-200 font-black text-4xl group-hover:scale-125 transition-transform">L</div>
                <p className="text-[10px] font-black text-blue-600 uppercase mb-2 tracking-widest">Available Lumpsum</p>
                <p className="text-4xl font-black text-blue-900 leading-none mb-1">₹{(portfolioSummary.investableFromCorpus || 0).toLocaleString()}</p>
                <p className="text-[9px] font-bold text-blue-500 italic uppercase">
                  {(portfolioSummary.investableFromCorpusWords || "").replace(/^Rupees:\s*/i, "")}
                </p>
              </div>
            </div>

            {portfolioSummary.breakdown && (
              <div className="mb-10 p-8 bg-slate-900 text-white rounded-[2.5rem] shadow-2xl relative border border-slate-800">
                <div className="absolute -top-3 -right-3 bg-blue-600 text-white p-2 rounded-xl text-[10px] font-black uppercase tracking-widest rotate-12 shadow-lg">AI Logic</div>
                <h4 className="text-[10px] font-black uppercase text-blue-400 mb-6 tracking-widest border-b border-slate-800 pb-3 flex items-center justify-between">
                  Granular Financial Breakdown
                  <span className="text-slate-500 lowercase font-medium">calculated based on net surplus</span>
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-4 mb-8">
                  <div className="flex justify-between items-center text-xs border-b border-slate-800 pb-2">
                    <span className="text-slate-400 font-bold uppercase tracking-tight">Total Monthly Inflow</span>
                    <span className="font-black text-emerald-400 text-sm">₹{portfolioSummary.breakdown.totalMonthlyInflow?.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs border-b border-slate-800 pb-2">
                    <span className="text-slate-400 font-bold uppercase tracking-tight">Total Outflow (Fixed)</span>
                    <span className="font-black text-rose-400 text-sm">- ₹{portfolioSummary.breakdown.totalMonthlyOutflow?.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs border-b border-slate-800 pb-2 bg-slate-800/30 p-2 rounded-lg md:col-span-2">
                    <span className="text-blue-300 font-black uppercase tracking-widest text-[10px]">Net Surplus Before Reserve</span>
                    <span className="font-black text-white text-base">₹{portfolioSummary.breakdown.surplusBeforeInvestment?.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs md:col-span-2 text-slate-500 italic mt-2 px-2">
                    <span>* Includes Emergency Buffer of ₹{portfolioSummary.breakdown.emergencyBuffer?.toLocaleString()}</span>
                  </div>
                </div>
                <div className="p-5 bg-slate-800/50 rounded-2xl border border-slate-700/50">
                  <p className="text-[10px] font-black text-slate-500 uppercase mb-2 tracking-widest">Financial Reasoning</p>
                  <p className="text-[11px] leading-relaxed text-slate-300 font-medium italic">"{portfolioSummary.reasoning}"</p>
                </div>
              </div>
            )}

            <div className="space-y-8">
              <div className="bg-slate-100 p-2 rounded-2xl flex gap-2">
                {['SIP', 'Lumpsum', 'Both'].map((t) => (
                  <button key={t} onClick={() => setInvestment({...investment, type: t as any})} className={`flex-1 py-4 rounded-xl font-black uppercase tracking-widest transition-all ${investment.type === t ? 'bg-blue-600 text-white shadow-lg scale-[1.02]' : 'bg-transparent text-slate-400 hover:text-slate-600'}`}>{t}</button>
                ))}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {(investment.type === 'SIP' || investment.type === 'Both') && (
                  <Input 
                    label="Desired Monthly SIP (₹)" 
                    type="number" 
                    value={investment.sipAmount} 
                    onChange={v => setInvestment({...investment, sipAmount: v})} 
                    helperText={sipWords ? `Rupees: ${sipWords}` : ""}
                    tooltip="Enter the exact amount you wish to invest monthly."
                  />
                )}
                {(investment.type === 'Lumpsum' || investment.type === 'Both') && (
                  <Input 
                    label="Desired Lumpsum (₹)" 
                    type="number" 
                    value={investment.lumpsumAmount} 
                    onChange={v => setInvestment({...investment, lumpsumAmount: v})} 
                    helperText={lumpsumWords ? `Rupees: ${lumpsumWords}` : ""}
                    tooltip="Enter the bulk amount available for investment."
                  />
                )}
              </div>
              <div className="flex justify-center pt-4">
                <Button onClick={handleFinalSubmit} disabled={loading} className="w-full py-5 text-xl tracking-widest uppercase shadow-2xl transition-all hover:scale-[1.01] active:scale-[0.99]">{loading ? 'Fetching Institutional Data...' : 'Finalize Portfolio Report'}</Button>
              </div>
            </div>
          </Card>
        )}

        {step === 5 && (
          <div className="space-y-10 animate-in slide-in-from-bottom-5 duration-700">
            {/* Overlap Logic */}
            {hasAnyOverlap && (
              <div className="bg-amber-50 border-l-8 border-amber-500 p-6 rounded-r-3xl shadow-xl print:hidden animate-pulse">
                <div className="flex justify-between items-center gap-6">
                  <div className="flex items-center gap-4">
                    <span className="text-3xl">🧩</span>
                    <div>
                      <p className="text-sm font-black text-amber-900 uppercase tracking-widest">Asset Overlap Detected</p>
                      <p className="text-xs text-amber-800 font-bold">Your selection contains duplicate funds which limits diversification benefits. Let AI re-balance the portfolio.</p>
                    </div>
                  </div>
                  <Button onClick={fixOverlapsWithAI} variant="secondary" disabled={loading} className="!bg-amber-500 !text-white !px-8 !py-3 !text-xs !font-black uppercase shadow-lg hover:!bg-amber-600">
                    {loading ? 'Diversifying...' : 'Re-Balance with AI'}
                  </Button>
                </div>
              </div>
            )}

            {/* Total Check */}
            {(allocationSums.sip !== 100 || allocationSums.lumpsum !== 100) && (
              <div className="bg-rose-50 border-l-8 border-rose-500 p-4 rounded-r-2xl shadow-lg print:hidden">
                <p className="text-xs font-black text-rose-800 uppercase tracking-widest">Allocation Totals</p>
                <div className="flex gap-8 mt-1">
                  <p className={`text-xs font-bold ${allocationSums.sip === 100 ? 'text-emerald-600' : 'text-rose-600'}`}>SIP Total: {allocationSums.sip}% {allocationSums.sip !== 100 && '(Must be 100)'}</p>
                  <p className={`text-xs font-bold ${allocationSums.lumpsum === 100 ? 'text-emerald-600' : 'text-rose-600'}`}>Lumpsum Total: {allocationSums.lumpsum}% {allocationSums.lumpsum !== 100 && '(Must be 100)'}</p>
                </div>
              </div>
            )}

            <div ref={reportRef} className="bg-white p-14 rounded-[4rem] shadow-2xl border border-slate-100 print:shadow-none relative overflow-hidden">
              {/* Header */}
              <div className="relative z-10 flex flex-col md:flex-row justify-between border-b-4 border-slate-50 pb-12 mb-12">
                <div>
                  <h1 className="text-6xl font-black text-slate-900 mb-3 uppercase tracking-tighter leading-none">Portfolio Proposal</h1>
                  <p className="text-slate-400 text-2xl font-bold flex items-center gap-3">
                    Personalized for <span className="text-blue-600 decoration-blue-200 decoration-8 underline underline-offset-[16px]">{personal.name}</span>
                  </p>
                </div>
                <div className="bg-slate-900 p-8 rounded-[3rem] text-right shadow-2xl border-4 border-slate-800 mt-8 md:mt-0 transform -rotate-2">
                  <p className="text-[10px] font-black text-blue-400 uppercase tracking-[0.3em] mb-2">SEBI Risk Category</p>
                  <p className="text-3xl font-black text-white uppercase leading-none tracking-tighter">{riskProfile?.category}</p>
                </div>
              </div>

              {/* Suitability & Risk Profile Detailed Section */}
              <div className="mb-16 relative z-10 p-10 bg-slate-50 rounded-[3.5rem] border border-slate-100 shadow-inner">
                 <h3 className="text-3xl font-black text-slate-900 mb-8 uppercase tracking-tighter flex items-center gap-4">
                   <span className="w-12 h-12 bg-blue-600 text-white rounded-2xl flex items-center justify-center text-xl shadow-lg">🛡️</span>
                   Risk Analysis & Suitability
                 </h3>
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                    <div className="space-y-6">
                       <div className="p-6 bg-white rounded-3xl border border-slate-200 shadow-sm">
                          <p className="text-[10px] font-black text-blue-600 uppercase mb-3 tracking-widest">Investor Risk Profile</p>
                          <p className="text-sm font-bold text-slate-700 leading-relaxed italic">
                            "{riskProfile?.description || "Based on your responses, you possess a balanced approach to market volatility, seeking growth while maintaining capital safety guardrails."}"
                          </p>
                       </div>
                       <div className="flex gap-4">
                          <div className={`px-5 py-2 rounded-full border-2 font-black text-[10px] uppercase tracking-widest ${getRiskColor(riskProfile?.category || '')}`}>
                            {riskProfile?.category} Risk
                          </div>
                          <div className="px-5 py-2 rounded-full border-2 border-slate-200 bg-white font-black text-[10px] uppercase tracking-widest text-slate-500">
                            SEBI Compliant
                          </div>
                       </div>
                    </div>
                    <div className="space-y-4">
                       <div className="flex items-start gap-4 p-5 bg-white rounded-2xl border border-slate-100 shadow-sm">
                          <span className="text-2xl">⏳</span>
                          <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Recommended Horizon</p>
                            <p className="text-sm font-black text-slate-800">Minimum 5-7 Years for Equity Composition</p>
                          </div>
                       </div>
                       <div className="flex items-start gap-4 p-5 bg-white rounded-2xl border border-slate-100 shadow-sm">
                          <span className="text-2xl">📈</span>
                          <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Portfolio Strategy</p>
                            <p className="text-sm font-black text-slate-800">Diversified Alpha Generation</p>
                          </div>
                       </div>
                    </div>
                 </div>
              </div>

              {/* Summary Stats */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16 relative z-10">
                <div className="p-8 bg-emerald-50 rounded-[3rem] border-2 border-emerald-100 shadow-sm transform hover:scale-105 transition-all">
                  <p className="text-[11px] font-black text-emerald-600 uppercase mb-4 tracking-widest">Monthly SIP Committed</p>
                  <p className="text-4xl font-black text-emerald-900 leading-none">₹{(investment.sipAmount || 0).toLocaleString()}</p>
                  <p className="text-[8px] font-bold text-emerald-400 mt-2 italic uppercase">Auto-debited Monthly</p>
                </div>
                <div className="p-8 bg-blue-50 rounded-[3rem] border-2 border-blue-100 shadow-sm transform hover:scale-105 transition-all">
                  <p className="text-[11px] font-black text-blue-600 uppercase mb-4 tracking-widest">Lumpsum Capital</p>
                  <p className="text-4xl font-black text-blue-900 leading-none">₹{(investment.lumpsumAmount || 0).toLocaleString()}</p>
                  <p className="text-[8px] font-bold text-blue-400 mt-2 italic uppercase">Initial Deployment</p>
                </div>
                <div className="p-8 bg-slate-900 rounded-[3rem] text-white shadow-2xl flex flex-col justify-center border-4 border-slate-800">
                  <p className="text-[11px] font-black text-slate-400 uppercase mb-3 tracking-widest">Selected Strategy</p>
                  <p className="text-3xl font-black text-blue-400 uppercase tracking-tighter leading-none">{investment.type}</p>
                </div>
              </div>

              {/* Fund Selection Table */}
              <div className="mb-16 relative z-10">
                <h3 className="text-4xl font-black text-slate-900 mb-10 uppercase tracking-tighter border-l-8 border-blue-600 pl-6">Scheme Selection Logic</h3>
                <div className="overflow-hidden rounded-[3.5rem] border border-slate-100 bg-slate-50 shadow-inner">
                  <table className="w-full text-left">
                    <thead className="bg-slate-900 text-white text-[11px] font-black uppercase tracking-widest">
                      <tr>
                        <th className="p-8">Growth-Regular Scheme Name</th>
                        <th className="p-8">Weightage (%)</th>
                        <th className="p-8 text-right">CAGR Returns</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(recommendations || []).map((s, idx) => {
                        const sortOrder = aumSortOrder[idx] || 'none';
                        const sortedAlternatives = [...(s?.alternatives || [])].sort((a, b) => {
                          if (sortOrder === 'none') return 0;
                          return sortOrder === 'desc' ? b.aum - a.aum : a.aum - b.aum;
                        });

                        return (
                          <React.Fragment key={idx}>
                            <tr className={`bg-white transition-all hover:bg-blue-50/30 ${overlapsMap[s?.name || ''] > 1 ? 'bg-amber-50/20' : ''}`}>
                              <td className="p-8">
                                <div className="print:hidden mb-4 flex flex-col gap-2">
                                  <div className="flex justify-between items-center pr-2">
                                    <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Fund Picker</span>
                                    <button 
                                      onClick={() => toggleAumSort(idx)} 
                                      className={`text-[8px] font-black uppercase tracking-tighter px-2 py-0.5 rounded-full transition-all ${sortOrder !== 'none' ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-500 hover:bg-slate-300'}`}
                                    >
                                      AUM Sort: {sortOrder === 'none' ? 'Default' : sortOrder === 'desc' ? 'Highest' : 'Lowest'}
                                    </button>
                                  </div>
                                  <select 
                                    className={`w-full p-3.5 text-xs font-black border-2 rounded-2xl outline-none transition-all shadow-sm ${overlapsMap[s?.name || ''] > 1 ? 'border-amber-300 bg-amber-50 text-amber-900' : 'bg-slate-50 border-slate-100 hover:border-blue-200'}`}
                                    value={s?.name || ""}
                                    onChange={(e) => handleSchemeChange(idx, e.target.value)}
                                  >
                                    {s?.name && <option value={s.name}>{s.name} ({s.performance?.cagr5y || 0}% CAGR) {overlapsMap[s.name] > 1 ? '[OVERLAP]' : ''}</option>}
                                    {sortedAlternatives.map(alt => (
                                      <option key={alt?.name || Math.random()} value={alt?.name || ""}>
                                        {alt?.name} ({alt?.performance?.cagr5y || 0}% CAGR) [AUM: ₹{alt.aum} Cr]
                                      </option>
                                    ))}
                                  </select>
                                </div>
                                <div className="flex flex-col gap-2">
                                  <p className="font-black text-slate-900 hidden print:block text-lg">{s?.name}</p>
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-3 py-1 bg-slate-100 rounded-full border border-slate-200">{s?.category || "Equity"}</span>
                                    {s?.riskMetrics?.sebiRisk && (
                                      <span className={`text-[9px] font-black uppercase tracking-widest px-3 py-1 rounded-full border ${getRiskColor(s.riskMetrics.sebiRisk)}`}>
                                        {s.riskMetrics.sebiRisk} Risk
                                      </span>
                                    )}
                                    {s?.name && overlapsMap[s.name] > 1 && <span className="text-[9px] bg-rose-500 text-white px-3 py-1 rounded-full font-black uppercase tracking-tighter animate-pulse shadow-sm">Overlap</span>}
                                    {s?.name && <button onClick={() => toggleRisk(s.name)} className="text-[9px] px-3 py-1 bg-blue-600 text-white rounded-full font-black hover:bg-blue-700 transition-all uppercase tracking-widest shadow-md print:hidden">View Details ⓘ</button>}
                                  </div>
                                </div>
                              </td>
                              <td className="p-8">
                                <div className="space-y-4">
                                  {editingAllocationIdx === idx ? (
                                    <div className="space-y-3 print:hidden">
                                      {(investment.type === 'SIP' || investment.type === 'Both') && (
                                        <div className="flex flex-col gap-1">
                                          <label className="text-[8px] font-black uppercase text-slate-400">SIP Allocation %</label>
                                          <input 
                                            type="number" 
                                            className="w-full p-2 text-xs border-2 border-emerald-200 rounded-lg outline-none font-black"
                                            value={s.sipAllocationPct}
                                            onChange={(e) => handleAllocationOverride(idx, 'sip', Number(e.target.value))}
                                          />
                                        </div>
                                      )}
                                      {(investment.type === 'Lumpsum' || investment.type === 'Both') && (
                                        <div className="flex flex-col gap-1">
                                          <label className="text-[8px] font-black uppercase text-slate-400">Lumpsum Allocation %</label>
                                          <input 
                                            type="number" 
                                            className="w-full p-2 text-xs border-2 border-blue-200 rounded-lg outline-none font-black"
                                            value={s.lumpsumAllocationPct}
                                            onChange={(e) => handleAllocationOverride(idx, 'lumpsum', Number(e.target.value))}
                                          />
                                        </div>
                                      )}
                                      <button 
                                        onClick={() => setEditingAllocationIdx(null)}
                                        className="w-full bg-slate-900 text-white text-[8px] font-black py-1 rounded-lg uppercase tracking-widest"
                                      >
                                        Done
                                      </button>
                                    </div>
                                  ) : (
                                    <>
                                      <div className="space-y-2">
                                        {(investment.type === 'SIP' || investment.type === 'Both') && (
                                          <div className="flex justify-between items-center bg-emerald-50 px-4 py-2 rounded-xl border border-emerald-100">
                                            <span className="text-[10px] text-emerald-600 font-black uppercase tracking-tight">SIP %</span>
                                            <span className="text-sm font-black text-emerald-800">{s?.sipAllocationPct || 0}%</span>
                                          </div>
                                        )}
                                        {(investment.type === 'Lumpsum' || investment.type === 'Both') && (
                                          <div className="flex justify-between items-center bg-blue-50 px-4 py-2 rounded-xl border border-blue-100">
                                            <span className="text-[10px] text-blue-600 font-black uppercase tracking-tight">Bulk %</span>
                                            <span className="text-sm font-black text-blue-800">{s?.lumpsumAllocationPct || 0}%</span>
                                          </div>
                                        )}
                                      </div>
                                      <button 
                                        onClick={() => setEditingAllocationIdx(idx)}
                                        className="text-[9px] font-black text-blue-600 underline uppercase tracking-widest mt-2 print:hidden"
                                      >
                                        Adjust Weightage
                                      </button>
                                    </>
                                  )}
                                </div>
                              </td>
                              <td className="p-8 text-right">
                                <SchemePerformanceComparison fund={s?.performance?.cagr5y} bench={s?.performance?.benchmarkReturn5y} benchName={s?.benchmark} />
                              </td>
                            </tr>
                            {s?.name && expandedRisk[s.name] && (
                              <tr className="bg-slate-900/5 transition-all">
                                <td colSpan={3} className="px-8 py-8">
                                  <div className="grid grid-cols-2 md:grid-cols-4 gap-6 bg-white p-8 rounded-[3rem] border-4 border-slate-100 shadow-2xl transform scale-[0.98]">
                                    <div className="relative group/risk p-4 bg-rose-50 rounded-3xl border border-rose-100">
                                      <p className="text-[9px] font-black text-rose-400 uppercase mb-2 tracking-widest flex items-center gap-1">
                                        Max Drawdown ⓘ
                                        <span className="invisible group-hover/risk:visible absolute z-[100] w-56 bg-slate-900 text-white text-[11px] p-3 rounded-2xl shadow-2xl bottom-full left-0 mb-4 leading-relaxed font-bold border border-slate-700">Highest historical peak-to-trough drop. Indicates capital safety.</span>
                                      </p>
                                      <p className="text-xl font-black text-rose-700">{s.riskMetrics?.maxDrawdown || 0}%</p>
                                    </div>
                                    <div className="relative group/vol p-4 bg-amber-50 rounded-3xl border border-amber-100">
                                      <p className="text-[9px] font-black text-amber-600 uppercase mb-2 tracking-widest flex items-center gap-1">
                                        Volatility ⓘ
                                        <span className="invisible group-hover/vol:visible absolute z-[100] w-56 bg-slate-900 text-white text-[11px] p-3 rounded-2xl shadow-2xl bottom-full left-0 mb-4 leading-relaxed font-bold border border-slate-700">The degree of variation in price. Lower is smoother.</span>
                                      </p>
                                      <p className="text-xl font-black text-amber-800">{s.riskMetrics?.volatility || 0}%</p>
                                    </div>
                                    <div className="relative group/beta p-4 bg-blue-50 rounded-3xl border border-blue-100">
                                      <p className="text-[9px] font-black text-blue-600 uppercase mb-2 tracking-widest flex items-center gap-1">
                                        Beta ⓘ
                                        <span className="invisible group-hover/beta:visible absolute z-[100] w-56 bg-slate-900 text-white text-[11px] p-3 rounded-2xl shadow-2xl bottom-full left-0 mb-4 leading-relaxed font-bold border border-slate-700">Market sensitivity. 1.0 means it moves with the market index.</span>
                                      </p>
                                      <p className="text-xl font-black text-blue-800">{s.riskMetrics?.beta || 0}</p>
                                    </div>
                                    <div className="p-4 bg-slate-50 rounded-3xl border border-slate-200">
                                      <p className="text-[9px] font-black text-slate-400 uppercase mb-2 tracking-widest">Fund Size</p>
                                      <p className="text-xl font-black text-slate-800">₹{(s.aum || 0).toLocaleString()} Cr</p>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Disclaimer */}
              <div className="bg-slate-900 text-slate-400 p-12 rounded-[4rem] text-[11px] leading-relaxed relative z-10 shadow-2xl border-4 border-slate-800">
                <p className="font-black text-blue-400 mb-6 uppercase tracking-[0.2em] border-b border-slate-800 pb-4 text-sm">Strategic Advisory Note</p>
                <div className="mb-8 text-slate-200 font-bold italic text-sm leading-relaxed">
                  <p>"{portfolioSummary?.reasoning || "Optimized for long-term compounding with institutional risk management guardrails."}"</p>
                </div>
                <div className="p-8 bg-slate-800/40 rounded-[2.5rem] border border-slate-700/50">
                   <p className="uppercase font-black tracking-widest text-white mb-3 text-xs">Statutory AMFI Disclosure:</p>
                   <p className="leading-relaxed opacity-60 font-medium">Mutual Fund investments are subject to market risks, read all scheme related documents carefully. The selection is based on past performance data which may or may not be sustained in future. Generated by AI Agent WealthGenie on {new Date().toLocaleDateString()}.</p>
                </div>
              </div>
            </div>

            <div className="flex justify-center gap-8 print:hidden mb-20">
              <Button onClick={() => setStep(4)} variant="secondary" className="px-16 py-6 font-black uppercase tracking-widest text-[11px] shadow-2xl bg-white border-2 border-slate-200">Back</Button>
              <Button onClick={generateReport} disabled={loading} className="px-16 py-6 bg-blue-600 text-white rounded-full font-black uppercase tracking-widest text-[11px] shadow-[0_20px_50px_rgba(37,99,235,0.3)] transition-all hover:scale-110 active:scale-95">
                {loading ? 'Compiling PDF Data...' : 'Download Full PDF Report'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;
