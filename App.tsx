
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

const DRAFT_KEY = 'wealthgenie_draft_v2';

const App: React.FC = () => {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiCorrection, setAiCorrection] = useState<string | null>(null);
  const [hasDraft, setHasDraft] = useState(false);
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

  // Word conversion states
  const [sipWords, setSipWords] = useState<string>("");
  const [lumpsumWords, setLumpsumWords] = useState<string>("");
  const [corpusWords, setCorpusWords] = useState<string>("");
  const [incomeWords, setIncomeWords] = useState<string>("");
  
  const sipTimeoutRef = useRef<any>(null);
  const lumpsumTimeoutRef = useRef<any>(null);
  const corpusTimeoutRef = useRef<any>(null);
  const incomeTimeoutRef = useRef<any>(null);

  useEffect(() => {
    const saved = localStorage.getItem(DRAFT_KEY);
    if (saved) setHasDraft(true);
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
  const debounceWords = (amount: number, setWords: (w: string) => void, ref: React.MutableRefObject<any>) => {
    if (amount > 0) {
      if (ref.current) clearTimeout(ref.current);
      ref.current = setTimeout(async () => {
        const words = await getAmountInWords(amount);
        setWords(words);
      }, 600);
    } else setWords("");
  };

  useEffect(() => debounceWords(investment.sipAmount, setSipWords, sipTimeoutRef), [investment.sipAmount]);
  useEffect(() => debounceWords(investment.lumpsumAmount, setLumpsumWords, lumpsumTimeoutRef), [investment.lumpsumAmount]);
  useEffect(() => debounceWords(financial.totalCorpusToInvest, setCorpusWords, corpusTimeoutRef), [financial.totalCorpusToInvest]);
  useEffect(() => debounceWords(financial.monthlyIncome, setIncomeWords, incomeTimeoutRef), [financial.monthlyIncome]);

  const saveDraft = () => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ personal, financial, riskAnswers, riskProfile, investment, recommendations, portfolioSummary, step }));
    alert("Progress saved!");
    setHasDraft(true);
  };

  const loadDraft = () => {
    const saved = localStorage.getItem(DRAFT_KEY);
    if (!saved) return;
    const data = JSON.parse(saved);
    setPersonal(data.personal);
    setFinancial(data.financial);
    setRiskAnswers(data.riskAnswers);
    setRiskProfile(data.riskProfile);
    setInvestment(data.investment);
    setRecommendations(data.recommendations || []);
    setPortfolioSummary(data.portfolioSummary);
    setStep(data.step);
    setHasDraft(false);
  };

  const handlePersonalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!personal.mobile.match(/^[0-9]{10}$/)) { setError("Valid mobile required."); return; }
    setError(null);
    setStep(2);
  };

  const handleFinancialSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const validation = await validateFinancialHealth(personal, financial);
      if (validation.suggestedTaxSlab && validation.suggestedTaxSlab !== financial.taxSlab) {
        setFinancial(prev => ({ ...prev, taxSlab: validation.suggestedTaxSlab! }));
        setAiCorrection(`AI Correction: Tax Slab optimized to "${validation.suggestedTaxSlab}".`);
      }
      if (!validation.isValid) { setError(validation.errorMessage); setLoading(false); return; }
      setStep(3);
    } catch (err) { setError("Validation error. Try again."); }
    finally { setLoading(false); }
  };

  const handleRiskSubmit = async () => {
    if (Object.keys(riskAnswers).length < RISK_QUESTIONS.length) { setError("Answer all questions."); return; }
    setLoading(true);
    try {
      const score = Object.values(riskAnswers).reduce((a: any, b: any) => a + b, 0);
      const [profile, summary] = await Promise.all([
        calculateRiskProfile(score as number, personal.age),
        getPortfolioSummary(financial, personal)
      ]);
      setRiskProfile(profile);
      setPortfolioSummary(summary);
      setInvestment(prev => ({
        ...prev,
        sipAmount: summary?.investableFromSalary || 0,
        lumpsumAmount: summary?.investableFromCorpus || 0
      }));
      setStep(4);
    } catch (err) { setError("Risk profiling failed."); }
    finally { setLoading(false); }
  };

  const handleFinalSubmit = async () => {
    setLoading(true);
    try {
      if (!riskProfile) return;
      const data = await getRecommendedSchemes(riskProfile, personal.age, investment, riskAnswers);
      setRecommendations(data || []);
      setStep(5);
    } catch (err) { setError("Scheme generation failed."); }
    finally { setLoading(false); }
  };

  const generateReport = async () => {
    if (!reportRef.current) return;
    setLoading(true);
    const element = reportRef.current;
    const opt = {
      margin: 0,
      filename: `WealthGenie_Report_${personal.name.replace(/\s+/g, '_')}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, letterRendering: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };
    try { await html2pdf().set(opt).from(element).save(); }
    catch (err) { alert("PDF generation failed."); }
    finally { setLoading(false); }
  };

  const getRiskColor = (risk: string) => {
    const r = risk.toLowerCase();
    if (r.includes('very high')) return 'bg-rose-100 text-rose-700 border-rose-200';
    if (r.includes('high')) return 'bg-orange-100 text-orange-700 border-orange-200';
    if (r.includes('moderately high')) return 'bg-amber-100 text-amber-700 border-amber-200';
    if (r.includes('low')) return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    return 'bg-blue-100 text-blue-700 border-blue-200';
  };

  const SchemeMetric = ({ label, value, colorClass }: { label: string, value: any, colorClass: string }) => (
    <div className={`p-3 rounded-2xl border ${colorClass} flex flex-col items-center justify-center text-center`}>
      <span className="text-[8px] font-black uppercase opacity-60 mb-1">{label}</span>
      <span className="text-sm font-black tracking-tight">{value}</span>
    </div>
  );

  return (
    <div className="min-h-screen py-10 px-4 bg-slate-50 font-['Inter']">
      <div className="max-w-5xl mx-auto">
        
        {/* Header/Nav */}
        <div className="mb-8 flex justify-between items-center print:hidden">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg">
              <span className="text-white font-black">W</span>
            </div>
            <h1 className="text-lg font-black text-slate-800 tracking-tight uppercase">WealthGenie <span className="text-blue-600">AI</span></h1>
          </div>
          <div className="flex gap-2">
            {hasDraft && step === 1 && <Button onClick={loadDraft} variant="secondary" className="!text-[10px] !py-2">Resume</Button>}
            {step > 1 && <Button onClick={saveDraft} variant="secondary" className="!text-[10px] !py-2">Save</Button>}
          </div>
        </div>

        {error && <div className="mb-6 p-4 bg-rose-50 border-2 border-rose-100 text-rose-800 rounded-xl text-xs font-bold text-center">⚠️ {error}</div>}
        {aiCorrection && <div className="mb-6 p-4 bg-blue-50 border-2 border-blue-200 text-blue-800 rounded-xl text-xs font-black text-center">🤖 {aiCorrection}</div>}

        {step === 1 && (
          <Card title="Client Onboarding">
            <form onSubmit={handlePersonalSubmit} className="space-y-4">
              <Input label="Full Name" value={personal.name} onChange={v => setPersonal({...personal, name: v})} required />
              <div className="flex gap-4">
                <div className="flex-1"><Input label="Date of Birth" type="date" value={personal.dob} onChange={v => setPersonal({...personal, dob: v})} required /></div>
                <div className="w-24"><Input label="Age" type="number" value={personal.age} onChange={()=>{}} disabled /></div>
              </div>
              <Input label="Mobile" value={personal.mobile} onChange={v => setPersonal({...personal, mobile: v})} placeholder="10 digits" required />
              <Input label="Email" type="email" value={personal.email} onChange={v => setPersonal({...personal, email: v})} required />
              <Button type="submit" className="w-full py-4 uppercase tracking-widest mt-4">Next: Financials</Button>
            </form>
          </Card>
        )}

        {step === 2 && (
          <Card title="STEP 2: FINANCIAL PROFILE">
            <form onSubmit={handleFinancialSubmit} className="space-y-6">
              <div className="flex gap-4 mb-4">
                {['Earning', 'Retired'].map(s => (
                  <button 
                    key={s} 
                    type="button" 
                    onClick={() => setFinancial({...financial, incomeStatus: s as any})} 
                    className={`flex-1 py-4 rounded-2xl border-2 font-black tracking-widest transition-all shadow-sm ${
                      financial.incomeStatus === s 
                        ? 'bg-blue-600 border-blue-600 text-white' 
                        : 'bg-white border-slate-100 text-slate-400 hover:border-slate-200'
                    }`}
                  >
                    {s.toUpperCase()}
                  </button>
                ))}
              </div>

              {financial.incomeStatus === 'Retired' && (
                <div className="p-6 bg-[#f8fbff] rounded-[2rem] border-2 border-[#e6f0ff] space-y-6 animate-in fade-in slide-in-from-top-4 duration-300">
                  <p className="text-[10px] font-black text-blue-900/60 uppercase tracking-[0.2em] mb-2 px-2">Retirement Specifics</p>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <button 
                      type="button"
                      onClick={() => setFinancial({...financial, hasCorpus: !financial.hasCorpus})}
                      className={`flex items-center gap-3 p-4 bg-white rounded-xl border-2 transition-all shadow-sm ${financial.hasCorpus ? 'border-blue-500 ring-4 ring-blue-50' : 'border-slate-100'}`}
                    >
                      <div className={`w-5 h-5 rounded flex items-center justify-center transition-all ${financial.hasCorpus ? 'bg-blue-600' : 'bg-slate-100 border border-slate-200'}`}>
                        {financial.hasCorpus && <span className="text-white text-[10px] font-black">✓</span>}
                      </div>
                      <span className="text-[10px] font-black text-slate-800 uppercase tracking-tight">Available Corpus</span>
                    </button>

                    <button 
                      type="button"
                      onClick={() => setFinancial({...financial, hasPension: !financial.hasPension})}
                      className={`flex items-center gap-3 p-4 bg-white rounded-xl border-2 transition-all shadow-sm ${financial.hasPension ? 'border-blue-500 ring-4 ring-blue-50' : 'border-slate-100'}`}
                    >
                      <div className={`w-5 h-5 rounded flex items-center justify-center transition-all ${financial.hasPension ? 'bg-blue-600' : 'bg-slate-100 border border-slate-200'}`}>
                        {financial.hasPension && <span className="text-white text-[10px] font-black">✓</span>}
                      </div>
                      <span className="text-[10px] font-black text-slate-800 uppercase tracking-tight">Pension/Monthly</span>
                    </button>
                  </div>

                  {financial.hasCorpus && (
                    <Input 
                      label="Total Corpus Value (₹)" 
                      type="number" 
                      value={financial.totalCorpusToInvest} 
                      onChange={v => setFinancial({...financial, totalCorpusToInvest: v})} 
                      required 
                      tooltip="Enter your total retirement corpus or any large lumpsum available for investment."
                      helperText={corpusWords}
                    />
                  )}
                </div>
              )}

              <Input 
                label={`Monthly Inflow (${financial.incomeStatus === 'Retired' ? 'Pension/Monthly' : 'Salary'}) (₹)`} 
                type="number" 
                value={financial.monthlyIncome} 
                onChange={v => setFinancial({...financial, monthlyIncome: v})} 
                required
                tooltip="Your monthly net inflow after all mandatory deductions."
                helperText={incomeWords}
              />

              <div className="grid grid-cols-2 gap-4">
                <Input label="Monthly Expenses" type="number" value={financial.monthlyExpenses} onChange={v => setFinancial({...financial, monthlyExpenses: v})} />
                <Input label="Yearly Expenses" type="number" value={financial.yearlyExpenses} onChange={v => setFinancial({...financial, yearlyExpenses: v})} />
              </div>

              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/60">
                <p className="text-[9px] font-black text-slate-500 uppercase tracking-[0.1em] mb-4">Tax Optimization</p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {TAX_SLABS.map(slab => (
                    <button
                      key={slab.range}
                      type="button"
                      onClick={() => setFinancial({...financial, taxSlab: slab.range})}
                      className={`p-2 text-center rounded-xl border-2 text-[8px] font-black transition-all ${
                        financial.taxSlab === slab.range ? 'bg-blue-50 border-blue-400 text-blue-700' : 'bg-white border-slate-100 text-slate-500'
                      }`}
                    >
                      {slab.range} <br/> <span className="opacity-50">{slab.rate}</span>
                    </button>
                  ))}
                </div>
              </div>

              <Button type="submit" disabled={loading} className="w-full py-5 uppercase tracking-[0.3em] font-black shadow-xl">
                {loading ? 'ANALYZING PROFILE...' : 'NEXT: RISK PROFILE'}
              </Button>
            </form>
          </Card>
        )}

        {step === 3 && (
          <Card title="Risk Tolerance Assessment">
            <div className="space-y-6">
              {RISK_QUESTIONS.map(q => (
                <div key={q.id} className="p-4 border-2 border-slate-100 rounded-xl">
                  <p className="font-black text-slate-800 text-sm mb-4">{q.question}</p>
                  <div className="space-y-2">
                    {q.options.map(o => (
                      <button key={o.text} onClick={() => setRiskAnswers({...riskAnswers, [q.id]: o.score})} className={`w-full text-left p-4 rounded-xl text-xs font-bold border-2 transition-all ${riskAnswers[q.id] === o.score ? 'bg-blue-600 border-blue-600 text-white shadow-md' : 'bg-slate-50 border-slate-50 text-slate-600'}`}>{o.text}</button>
                    ))}
                  </div>
                </div>
              ))}
              <Button onClick={handleRiskSubmit} disabled={loading} className="w-full py-4 tracking-widest">{loading ? 'Profiling...' : 'Calculate Strategy'}</Button>
            </div>
          </Card>
        )}

        {step === 4 && portfolioSummary && (
          <Card title="Investment Logic">
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100">
                <p className="text-[9px] font-black text-emerald-600 uppercase mb-1">Target SIP</p>
                <p className="text-2xl font-black text-emerald-900">₹{portfolioSummary.investableFromSalary.toLocaleString()}</p>
              </div>
              <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100">
                <p className="text-[9px] font-black text-blue-600 uppercase mb-1">Target Lumpsum</p>
                <p className="text-2xl font-black text-blue-900">₹{portfolioSummary.investableFromCorpus.toLocaleString()}</p>
              </div>
            </div>
            <div className="p-5 bg-slate-900 text-white rounded-2xl mb-6">
              <p className="text-[9px] font-black text-blue-400 uppercase tracking-[0.2em] mb-3">AI Suitability Assessment</p>
              <p className="text-xs leading-relaxed italic text-slate-300">"{portfolioSummary.suitabilityNarrative}"</p>
            </div>
            <div className="space-y-4">
              <div className="flex gap-2 p-1 bg-slate-100 rounded-xl">
                {['SIP', 'Lumpsum', 'Both'].map(t => (
                  <button key={t} onClick={() => setInvestment({...investment, type: t as any})} className={`flex-1 py-3 rounded-lg text-[10px] font-black uppercase transition-all ${investment.type === t ? 'bg-white shadow-sm text-blue-600' : 'text-slate-400'}`}>{t}</button>
                ))}
              </div>
              <Input label="Confirm SIP Amount" type="number" value={investment.sipAmount} onChange={v => setInvestment({...investment, sipAmount: v})} />
              <Input label="Confirm Lumpsum Amount" type="number" value={investment.lumpsumAmount} onChange={v => setInvestment({...investment, lumpsumAmount: v})} />
              <Button onClick={handleFinalSubmit} disabled={loading} className="w-full py-4 tracking-widest mt-2">{loading ? 'Fetching Schemes...' : 'Generate Compliance Report'}</Button>
            </div>
          </Card>
        )}

        {step === 5 && (
          <div className="space-y-8 animate-in slide-in-from-bottom-5 duration-500">
            <div ref={reportRef} className="bg-white p-0 rounded-[2.5rem] shadow-2xl border border-slate-200 overflow-hidden text-slate-900 print:shadow-none print:border-none">
              
              {/* Cover Page Branding */}
              <div className="bg-slate-900 p-16 text-white flex flex-col justify-between min-h-[400px]">
                <div className="flex justify-between items-start">
                  <div className="w-20 h-20 bg-blue-600 rounded-[2rem] flex items-center justify-center text-3xl font-black shadow-2xl rotate-12">W</div>
                  <div className="text-right">
                    <p className="text-blue-400 text-[10px] font-black uppercase tracking-[0.4em] mb-2">Private & Confidential</p>
                    <p className="text-2xl font-black tracking-tighter">WealthGenie Advisory</p>
                  </div>
                </div>
                <div>
                  <h1 className="text-7xl font-black uppercase tracking-tighter leading-none mb-4">Mutual Fund <br /><span className="text-blue-500">Portfolio</span></h1>
                  <p className="text-slate-400 text-xl font-bold border-l-4 border-blue-600 pl-4">Prepared for: <span className="text-white">{personal.name}</span></p>
                </div>
                <div className="flex justify-between border-t border-slate-800 pt-8 mt-8">
                  <div className="flex gap-10">
                    <div><p className="text-[8px] text-slate-500 uppercase font-black mb-1">Report Date</p><p className="text-xs font-black">{new Date().toLocaleDateString()}</p></div>
                    <div><p className="text-[8px] text-slate-500 uppercase font-black mb-1">Risk Grade</p><p className="text-xs font-black text-blue-400">{riskProfile?.category}</p></div>
                  </div>
                  <div className="text-right"><p className="text-[8px] text-slate-500 uppercase font-black mb-1">Reference ID</p><p className="text-xs font-black">WG-{Math.random().toString(36).substr(2, 9).toUpperCase()}</p></div>
                </div>
              </div>

              {/* Suitability Annexure */}
              <div className="p-16 border-b border-slate-100 bg-slate-50">
                <h3 className="text-3xl font-black mb-8 uppercase tracking-tighter flex items-center gap-4">
                  <span className="w-10 h-10 bg-slate-900 text-white rounded-xl flex items-center justify-center text-sm shadow-lg">01</span>
                  Suitability Assessment (Annexure A)
                </h3>
                <div className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-sm space-y-6">
                  <p className="text-sm leading-relaxed text-slate-600 font-medium">
                    As per SEBI (Investment Advisers) Regulations, we have assessed your risk profile and financial needs. The following portfolio is deemed suitable based on:
                  </p>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                    <div className="p-4 border-2 border-blue-50 rounded-2xl">
                      <p className="text-[8px] font-black text-blue-500 uppercase mb-1">Financial Goal</p>
                      <p className="text-sm font-black text-slate-800">Long-Term Wealth Creation</p>
                    </div>
                    <div className="p-4 border-2 border-emerald-50 rounded-2xl">
                      <p className="text-[8px] font-black text-emerald-500 uppercase mb-1">Risk Capacity</p>
                      <p className="text-sm font-black text-slate-800">{riskProfile?.category}</p>
                    </div>
                    <div className="p-4 border-2 border-purple-50 rounded-2xl">
                      <p className="text-[8px] font-black text-purple-500 uppercase mb-1">Goal Horizon</p>
                      <p className="text-sm font-black text-slate-800">5+ Years (Strategic)</p>
                    </div>
                  </div>
                  <div className="p-6 bg-slate-50 rounded-2xl italic text-slate-500 text-xs leading-relaxed border-l-4 border-slate-900">
                    "{portfolioSummary?.suitabilityNarrative}"
                  </div>
                </div>
              </div>

              {/* Recommended Allocation */}
              <div className="p-16">
                <h3 className="text-3xl font-black mb-10 uppercase tracking-tighter flex items-center gap-4">
                  <span className="w-10 h-10 bg-slate-900 text-white rounded-xl flex items-center justify-center text-sm shadow-lg">02</span>
                  Strategic Fund Selection
                </h3>
                <div className="overflow-hidden rounded-[2.5rem] border border-slate-200 shadow-xl bg-white">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-900 text-white uppercase text-[9px] font-black tracking-[0.2em]">
                        <th className="p-6">Scheme & Category</th>
                        <th className="p-6 text-center">Weight (%)</th>
                        <th className="p-6 text-right">Performance (5Y)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {recommendations.map((s, idx) => (
                        <React.Fragment key={idx}>
                          <tr className="hover:bg-slate-50 transition-all">
                            <td className="p-6">
                              <p className="font-black text-slate-900 mb-1">{s.name}</p>
                              <div className="flex gap-2">
                                <span className="text-[7px] font-black uppercase tracking-widest px-2 py-0.5 bg-slate-100 rounded text-slate-500">{s.category}</span>
                                <span className={`text-[7px] font-black uppercase tracking-widest px-2 py-0.5 rounded ${getRiskColor(s.riskMetrics.sebiRisk)}`}>{s.riskMetrics.sebiRisk} Risk</span>
                              </div>
                            </td>
                            <td className="p-6 text-center">
                              <span className="text-lg font-black text-blue-600">{investment.type === 'Lumpsum' ? s.lumpsumAllocationPct : s.sipAllocationPct}%</span>
                            </td>
                            <td className="p-6 text-right">
                              <div className="flex flex-col items-end">
                                <span className="text-lg font-black text-emerald-600">{s.performance.cagr5y}%</span>
                                <span className="text-[7px] font-bold text-slate-400 uppercase tracking-tighter">vs {s.benchmark.split(' ').slice(0,2).join(' ')}</span>
                              </div>
                            </td>
                          </tr>
                          <tr className="bg-slate-50/50">
                            <td colSpan={3} className="px-6 pb-6">
                              <div className="grid grid-cols-4 gap-4">
                                <SchemeMetric label="Max Drawdown" value={`${s.riskMetrics.maxDrawdown}%`} colorClass="bg-rose-50 border-rose-100 text-rose-700" />
                                <SchemeMetric label="Volatility" value={`${s.riskMetrics.volatility}%`} colorClass="bg-amber-50 border-amber-100 text-amber-700" />
                                <SchemeMetric label="Alpha" value={s.performance.alpha} colorClass="bg-emerald-50 border-emerald-100 text-emerald-700" />
                                <SchemeMetric label="AUM (Cr)" value={`₹${s.aum.toLocaleString()}`} colorClass="bg-slate-100 border-slate-200 text-slate-700" />
                              </div>
                            </td>
                          </tr>
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Compliance & Disclosures */}
              <div className="p-16 bg-slate-900 text-white">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-16">
                  <div>
                    <h4 className="text-blue-400 font-black text-[10px] uppercase tracking-[0.3em] mb-4">Statutory Disclosure</h4>
                    <p className="text-[9px] text-slate-400 leading-relaxed font-medium">
                      Mutual Fund investments are subject to market risks, read all scheme related documents carefully. Past performance is not an indicator of future returns. This report is generated by WealthGenie AI based on provided data and AMFI classification.
                    </p>
                  </div>
                  <div className="border-l border-slate-800 pl-16">
                    <h4 className="text-blue-400 font-black text-[10px] uppercase tracking-[0.3em] mb-6">Advisor Declaration</h4>
                    <div className="space-y-4">
                      <div className="w-32 h-12 border-b border-slate-600"></div>
                      <p className="text-[9px] font-black uppercase text-slate-400">WealthGenie Authorized MFD Representative</p>
                      <p className="text-[8px] text-slate-500 italic">ARN Code: WG-99221-AI | Validity: 2030</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-center gap-4 mt-10 mb-20 print:hidden">
              <Button onClick={() => setStep(4)} variant="secondary" className="px-10">Modify Selection</Button>
              <Button onClick={generateReport} disabled={loading} className="px-12 py-5 bg-blue-600 text-white font-black text-sm uppercase tracking-widest shadow-2xl hover:scale-105 active:scale-95 transition-all">
                {loading ? 'Compiling PDF...' : 'Download Institutional PDF Report'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;
