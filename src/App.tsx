import React, { useState, useEffect, useMemo } from 'react';
import { UserRole, RepairOrder, ROStatus, AppConfig, Technician, Part, InventoryAlert } from './types';
import { TECHNICIANS, DEFAULT_HOURLY_RATE } from './constants';
import { supabase, isSupabaseConfigured } from './supabaseClient';
import Header from './components/Header';
import ServiceManagerPage from './pages/ServiceManagerPage';
import PartsManagerPage from './pages/PartsManagerPage';
import TechnicianPage from './pages/TechnicianPage';
import AdminPage from './pages/AdminPage';
import DatabasePage from './pages/DatabasePage';
import BillingPage from './pages/BillingPage';
import InventoryPage from './pages/InventoryPage';
import MetricsPage from './pages/MetricsPage';
import CommsLink from './components/CommsLink';
import { toCamel, toSnake } from './utils';

const App: React.FC = () => {
  const [role, setRole] = useState<UserRole>(UserRole.SERVICE_MANAGER);
  const [repairOrders, setRepairOrders] = useState<RepairOrder[]>([]);
  const [masterInventory, setMasterInventory] = useState<Part[]>([]);
  const [inventoryAlerts, setInventoryAlerts] = useState<InventoryAlert[]>([]);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [config, setConfig] = useState<AppConfig>({
    logoUrl: 'https://i.imgur.com/QoW6b8j.png',
    companyName: 'STATELINE BOATWORKS',
    hourlyRate: DEFAULT_HOURLY_RATE,
    themeColors: {
      primary: '#2dd4bf', 
      secondary: '#38bdf8', 
      accent: '#ef4444' 
    }
  });
  const [currentTechnicianId, setCurrentTechnicianId] = useState<string | null>(null);
  const [isCommsLinkOpen, setIsCommsLinkOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchInitialData = async () => {
    setIsLoading(true);
    setError(null);

    if (!isSupabaseConfigured || !supabase) {
      setError("SUPABASE_UNCONFIGURED");
      setIsLoading(false);
      return;
    }

    try {
      const { data: roData, error: roError } = await supabase.from('repair_orders').select('*');
      if (roError) throw roError;
      setRepairOrders(toCamel<RepairOrder[]>(roData || []));

      const { data: invData, error: invError } = await supabase.from('master_inventory').select('*');
      if (invError) throw invError;
      setMasterInventory(toCamel<Part[]>(invData || []));
    } catch (error: any) {
      console.error("Database fetch error:", error);
      setError(error.message || "Uplink to Command Database failed.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!isDemoMode) {
      fetchInitialData();
    } else {
      setIsLoading(false);
      setError(null);
    }
  }, [isDemoMode]);

  useEffect(() => {
    if (role !== UserRole.TECHNICIAN) {
      setCurrentTechnicianId(null);
    }
  }, [role]);
  
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--color-primary', config.themeColors.primary);
    root.style.setProperty('--color-secondary', config.themeColors.secondary);
    root.style.setProperty('--color-accent', config.themeColors.accent);
  }, [config.themeColors]);

  const updateRO = async (updatedRO: RepairOrder) => {
    setRepairOrders(prev => prev.map(ro => ro.id === updatedRO.id ? updatedRO : ro));
    if (!isDemoMode && supabase) {
      await supabase.from('repair_orders').update(toSnake(updatedRO)).eq('id', updatedRO.id);
    }
  };
  
  const updateInventory = async (partNumber: string, quantityChange: number, reason: string, roId: string) => {
    const partToUpdate = masterInventory.find(p => p.partNumber === partNumber);
    if (!partToUpdate) return;
    
    const newQuantity = partToUpdate.quantityOnHand + quantityChange;
    setMasterInventory(prev => prev.map(part => part.partNumber === partNumber ? { ...part, quantityOnHand: newQuantity } : part));

    if (newQuantity <= partToUpdate.reorderPoint) {
      addInventoryAlert({partNumber, message: `Low stock: ${partToUpdate.description}`, roId, reason});
    }

    if (!isDemoMode && supabase) {
      await supabase.from('master_inventory').update({ quantity_on_hand: newQuantity }).eq('part_number', partNumber);
    }
  };
  
  const addInventoryAlert = (alert: Omit<InventoryAlert, 'id' | 'timestamp'>) => {
    const newAlert: InventoryAlert = { ...alert, id: `alert-${Date.now()}`, timestamp: Date.now() };
    setInventoryAlerts(prev => [newAlert, ...prev]);
  };

  const addRO = async (newRO: RepairOrder) => {
    setRepairOrders(prev => [...prev, newRO]);
    if (!isDemoMode && supabase) {
      await supabase.from('repair_orders').insert([toSnake(newRO)]);
    }
  };

  const handleExportData = () => {
    const data = { repairOrders, masterInventory, config, exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `SCC-DATA-EXPORT-${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const activeROForTech = repairOrders.find(ro => 
    (ro.status === ROStatus.ACTIVE || ro.status === ROStatus.READY_FOR_TECH) &&
    ro.technicianId === currentTechnicianId
  );
  
  const currentTechnician = useMemo(() => 
    TECHNICIANS.find(t => t.id === currentTechnicianId), 
    [currentTechnicianId]
  );

  const renderTechnicianView = () => {
    if (!currentTechnicianId) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[50vh] animate-in zoom-in duration-500">
           <div className="bg-slate-900/50 p-10 rounded-3xl border border-white/5 text-center shadow-2xl">
             <h2 className="text-xl font-black text-white uppercase tracking-widest mb-8">Identify Technician</h2>
             <div className="grid grid-cols-2 gap-4 w-full max-w-md">
               {TECHNICIANS.map(tech => (
                 <button 
                   key={tech.id} 
                   onClick={() => setCurrentTechnicianId(tech.id)}
                   className="p-6 bg-slate-800/50 border border-white/10 rounded-2xl hover:border-neon-seafoam transition-all text-lg font-bold hover:scale-105 active:scale-95 group"
                 >
                   <span className="block group-hover:neon-seafoam transition-all">{tech.name}</span>
                 </button>
               ))}
             </div>
           </div>
        </div>
      );
    }
    return <TechnicianPage repairOrder={activeROForTech} updateRO={updateRO} />;
  };
  
  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-950">
        <div className="relative">
          <div className="w-20 h-20 border-4 border-neon-seafoam/20 border-t-neon-seafoam rounded-full animate-spin"></div>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-10 h-10 bg-neon-seafoam/10 rounded-full animate-pulse"></div>
          </div>
        </div>
        <div className="mt-8 text-neon-seafoam font-mono text-sm tracking-[0.5em] uppercase animate-pulse">Establishing Uplink...</div>
      </div>
    );
  }

  if (error === "SUPABASE_UNCONFIGURED") {
    return (
        <div className="min-h-screen flex items-center justify-center p-8 bg-slate-950">
            <div className="glass p-10 rounded-3xl border-2 border-neon-steel/30 max-w-2xl text-center relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-neon-steel to-transparent animate-pulse"></div>
                <h2 className="text-3xl font-black neon-steel uppercase tracking-tighter mb-4">Identity Verification Failure</h2>
                <p className="text-slate-400 mb-8 font-medium leading-relaxed">
                   The Command Database requires a valid <span className="text-white font-bold">Supabase Anon Key</span> to establish a secure connection. 
                </p>
                <div className="space-y-4">
                  <button onClick={() => window.location.reload()} className="w-full bg-white text-slate-900 text-sm font-black px-12 py-4 rounded-xl shadow-lg hover:scale-[1.02] active:scale-95 transition-all uppercase tracking-widest">
                      Retry Handshake
                  </button>
                  <button onClick={() => setIsDemoMode(true)} className="w-full bg-slate-800 text-slate-200 text-sm font-black px-12 py-4 rounded-xl border border-white/10 hover:bg-slate-700 transition-all uppercase tracking-widest">
                      Launch Simulation Mode
                  </button>
                </div>
            </div>
        </div>
    );
  }

  const roleIcons = {
    [UserRole.SERVICE_MANAGER]: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" /><path fillRule="evenodd" d="M4 5a2 2 0 012-2h8a2 2 0 012 2v10a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h4a1 1 0 100-2H7zm0 4a1 1 0 100 2h4a1 1 0 100-2H7z" clipRule="evenodd" /></svg>,
    [UserRole.PARTS_MANAGER]: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM11 13a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>,
    [UserRole.INVENTORY_MANAGER]: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M7 3a1 1 0 000 2h6a1 1 0 100-2H7zM4 7a1 1 0 011-1h10a1 1 0 110 2H5a1 1 0 01-1-1zM2 11a2 2 0 012-2h12a2 2 0 012 2v4a2 2 0 01-2 2H4a2 2 0 01-2-2v-4z" /></svg>,
    [UserRole.TECHNICIAN]: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.532 1.532 0 012.287-.947c1.372.836 2.942-.734-2.106-2.106a1.532 1.532 0 01-.947-2.287c1.561-.379-1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" /></svg>,
    [UserRole.BILLING]: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-5a1 1 0 10-2 0v1h2v-1zM11 9a1 1 0 00-1-1H9a1 1 0 000 2h1a1 1 0 010 2H9a1 1 0 000 2h2a1 1 0 001-1v-1a1 1 0 01-1-1 1 1 0 100-2v-1a1 1 0 00-1-1z" clipRule="evenodd" /></svg>,
    [UserRole.DATABASE]: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M3 12v3c0 1.657 3.134 3 7 3s7-1.343 7-3v-3c0 1.657-3.134 3-7 3s-7-1.343-7-3z" /><path d="M3 7v3c0 1.657 3.134 3 7 3s7-1.343 7-3V7c0 1.657-3.134 3-7 3S3 8.657 3 7z" /><path d="M17 5c0 1.657-3.134 3-7 3S3 6.657 3 5s3.134-3 7-3 7 1.343 7 3z" /></svg>,
    [UserRole.METRICS]: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" /></svg>,
    [UserRole.ADMIN]: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" /></svg>,
  };

  return (
    <div className="min-h-screen pb-20">
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 glass px-3 py-2 rounded-full flex gap-1 z-50 border border-white/10 shadow-lg animate-in slide-in-from-bottom-8 duration-700">
        {Object.values(UserRole).map(roleKey => (
          <button 
            key={roleKey}
            onClick={() => setRole(roleKey)}
            title={roleKey.replace('_', ' ')}
            className={`h-11 w-11 flex items-center justify-center rounded-full transition-all ${role === roleKey ? 'bg-neon-seafoam text-slate-900 shadow-[0_0_15px_rgba(45,212,191,0.5)]' : 'text-slate-500 hover:bg-white/5 hover:text-white'}`}
          >
            {roleIcons[roleKey]}
          </button>
        ))}
      </div>

      <Header 
        activeRO={activeROForTech} 
        config={config} 
        currentTechnician={currentTechnician}
        onLogout={() => setCurrentTechnicianId(null)}
        currentRole={role}
        onCommsLinkToggle={() => setIsCommsLinkOpen(prev => !prev)}
      />
      
      <CommsLink isOpen={isCommsLinkOpen} onClose={() => setIsCommsLinkOpen(false)} />

      <main className="container mx-auto p-4 md:p-8">
        {role === UserRole.SERVICE_MANAGER && (
          <ServiceManagerPage 
            addRO={addRO} 
            repairOrders={repairOrders}
            updateRO={updateRO}
            hourlyRate={config.hourlyRate}
            masterInventory={masterInventory}
          />
        )}
        {role === UserRole.PARTS_MANAGER && (
          <PartsManagerPage 
            repairOrders={repairOrders.filter(ro => [ROStatus.AUTHORIZED, ROStatus.PARTS_PENDING].includes(ro.status))} 
            updateRO={updateRO}
            masterInventory={masterInventory}
            updateInventory={updateInventory}
            addInventoryAlert={addInventoryAlert}
          />
        )}
        {role === UserRole.INVENTORY_MANAGER && (
            <InventoryPage
              inventory={masterInventory}
              setInventory={setMasterInventory}
              alerts={inventoryAlerts}
            />
        )}
        {role === UserRole.TECHNICIAN && renderTechnicianView()}
        {role === UserRole.BILLING && (
          <BillingPage 
            repairOrders={repairOrders.filter(ro => ro.status === ROStatus.COMPLETED || ro.status === ROStatus.PENDING_INVOICE)}
            updateRO={updateRO}
          />
        )}
        {role === UserRole.DATABASE && (
          <DatabasePage allROs={repairOrders} />
        )}
        {role === UserRole.METRICS && (
          <MetricsPage repairOrders={repairOrders} inventory={masterInventory} config={config} />
        )}
        {role === UserRole.ADMIN && (
          <AdminPage config={config} setConfig={setConfig} onExport={handleExportData} />
        )}
      </main>
    </div>
  );
};

export default App;
