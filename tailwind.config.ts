import type { Config } from 'tailwindcss';
const config: Config = { content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'], theme: { extend: { colors: { brand: { blue: '#1D4ED8', green: '#16A34A', orange: '#EA580C', dark: '#0F172A' } } } }, plugins: [] };
export default config;
