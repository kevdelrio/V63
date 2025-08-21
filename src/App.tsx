import React, { useEffect, lazy, Suspense } from 'react';
import Header from '@/components/Header';
import Hero from '@/components/Hero';
import About from '@/components/About';
import Services from '@/components/Services';
import Process from '@/components/Process';
import ReportViewer from '@/components/ReportViewer';
import Benefits from '@/components/Benefits';
import Zones from '@/components/Zones';
import Pricing from '@/components/Pricing';
const Calculator = lazy(() => import('@/components/Calculator'));
const Testimonials = lazy(() => import('@/components/Testimonials'));
const Faq = lazy(() => import('@/components/Faq'));
const Contact = lazy(() => import('@/components/Contact'));
const Legal = lazy(() => import('@/components/Legal'));
import Footer from '@/components/Footer';

const App: React.FC = () => {
    useEffect(() => {
        const hash = window.location.hash.substring(1);
        if (hash) {
            setTimeout(() => {
                const element = document.getElementById(hash);
                if (element) {
                    element.scrollIntoView({ behavior: 'smooth' });
                }
            }, 200);
        }
    }, []);

    return (
        <div className="bg-white text-slate-700 font-sans">
            <Header />
            <main>
                <Hero />
                <About />
                <Services />
                <Process />
                <ReportViewer />
                <Benefits />
                <Zones />
                <Pricing />
                <Suspense fallback={<div>Chargement…</div>}>
                    <Calculator />
                    <Testimonials />
                    <Faq />
                    <Contact />
                    <Legal />
                </Suspense>
            </main>
            <Footer />
        </div>
    );
};

export default App;
