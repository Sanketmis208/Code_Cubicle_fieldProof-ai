import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from '@/contexts/auth-context';
import App from './App';
import './index.css';

const queryClient=new QueryClient({defaultOptions:{queries:{staleTime:30_000,refetchOnWindowFocus:false}}});
createRoot(document.getElementById('root')!).render(<StrictMode><QueryClientProvider client={queryClient}><BrowserRouter><AuthProvider><App/><Toaster position="top-right" toastOptions={{style:{borderRadius:'12px',fontSize:'14px'}}}/></AuthProvider></BrowserRouter></QueryClientProvider></StrictMode>);
