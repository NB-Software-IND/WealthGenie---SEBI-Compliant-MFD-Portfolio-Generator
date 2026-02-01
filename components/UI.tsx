import React from 'react';

export const Input: React.FC<{
  label: string;
  type?: string;
  value: string | number;
  onChange: (val: any) => void;
  placeholder?: string;
  required?: boolean;
  tooltip?: string;
  disabled?: boolean;
  helperText?: string;
}> = ({ label, type = "text", value, onChange, placeholder, required, tooltip, disabled, helperText }) => (
  <div className="mb-4 relative group/field">
    <label className="block text-sm font-medium text-slate-700 mb-1">
      {label} {required && <span className="text-red-500">*</span>}
      {tooltip && (
        <span className="ml-1 inline-block text-xs text-blue-500 cursor-help relative group/tooltip">
          ⓘ
          <span className="invisible group-hover/tooltip:visible absolute z-[100] w-56 bg-slate-900 text-white text-[11px] p-2.5 rounded-lg shadow-2xl bottom-full left-0 mb-2 leading-tight border border-slate-700 backdrop-blur-sm">
            {tooltip}
            <span className="absolute -bottom-1 left-2 w-2 h-2 bg-slate-900 rotate-45 border-r border-b border-slate-700"></span>
          </span>
        </span>
      )}
    </label>
    <input
      type={type}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(type === 'number' ? Number(e.target.value) : e.target.value)}
      className={`w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all ${disabled ? 'bg-slate-50 cursor-not-allowed opacity-60' : 'bg-white'}`}
      placeholder={placeholder}
      required={required}
    />
    {helperText && (
      <p className="mt-1.5 text-[10px] font-bold text-blue-600 italic tracking-tight animate-in fade-in slide-in-from-top-1 duration-300">
        {helperText}
      </p>
    )}
  </div>
);

export const Button: React.FC<{
  onClick?: () => void;
  type?: "button" | "submit";
  variant?: "primary" | "secondary" | "danger";
  children: React.ReactNode;
  disabled?: boolean;
  className?: string;
}> = ({ onClick, type = "button", variant = "primary", children, disabled, className }) => {
  const styles = {
    primary: "bg-blue-600 hover:bg-blue-700 text-white shadow-md hover:shadow-lg",
    secondary: "bg-slate-200 hover:bg-slate-300 text-slate-800",
    danger: "bg-red-600 hover:bg-red-700 text-white shadow-md",
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${styles[variant]} px-6 py-2.5 rounded-full font-bold text-sm transition-all transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none ${className}`}
    >
      {children}
    </button>
  );
};

export const Card: React.FC<{ children: React.ReactNode; title?: string }> = ({ children, title }) => (
  <div className="bg-white p-8 rounded-2xl shadow-xl border border-slate-200 max-w-2xl mx-auto w-full transition-all hover:shadow-2xl">
    {title && <h2 className="text-3xl font-black text-slate-900 mb-8 text-center uppercase tracking-tight">{title}</h2>}
    {children}
  </div>
);