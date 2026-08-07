import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "./lib/theme";
import { ToastProvider } from "./lib/toast";
import { JobsProvider } from "./lib/jobs";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import SearchPage from "./pages/SearchPage";
import GraphPage from "./pages/GraphPage";
import IngestPage from "./pages/IngestPage";
import ClustersPage from "./pages/ClustersPage";
import SettingsPage from "./pages/SettingsPage";
import NotFound from "./pages/NotFound";

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <JobsProvider>
          <BrowserRouter>
            <Routes>
              <Route element={<Layout />}>
                <Route path="/" element={<Dashboard />} />
                <Route path="/search" element={<SearchPage />} />
                <Route path="/graph" element={<GraphPage />} />
                <Route path="/ingest" element={<IngestPage />} />
                <Route path="/clusters" element={<ClustersPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="*" element={<NotFound />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </JobsProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
