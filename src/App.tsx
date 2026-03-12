import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ScrapeProvider } from "@/contexts/ScrapeContext";
import Index from "./pages/Index";
import PEScout from "./pages/PEScout";
import IBScout from "./pages/IBScout";
import STScout from "./pages/STScout";
import MCScout from "./pages/MCScout";
import IMScout from "./pages/IMScout";
import TechScout from "./pages/TechScout";
import StartupScout from "./pages/StartupScout";
import OutboundRedirect from "./pages/OutboundRedirect";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <ScrapeProvider>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/pe" element={<PEScout />} />
            <Route path="/ib" element={<IBScout />} />
            <Route path="/mc" element={<MCScout />} />
            <Route path="/st" element={<STScout />} />
            <Route path="/im" element={<IMScout />} />
            <Route path="/tech" element={<TechScout />} />
            <Route path="/startups" element={<StartupScout />} />
            <Route path="/out" element={<OutboundRedirect />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </ScrapeProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
