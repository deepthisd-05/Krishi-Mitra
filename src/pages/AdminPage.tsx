import React, { useEffect, useState } from 'react';
import { Check, Shield, X } from 'lucide-react';
import { apiFetch } from '../lib/api';
import type { AgroShop, EquipmentRental, UserProfile } from '../types';

interface AdminOverview {
  farmers: Array<{
    id: number;
    name: string;
    identifier: string;
    email: string | null;
    phone: string | null;
    auth_provider: string;
    verification_status: string;
    role: string;
    district: string;
    taluk: string;
    village: string;
    farm_size_acres: number;
  }>;
  shops: AgroShop[];
  rentals: EquipmentRental[];
  enquiries: Array<{
    id: number;
    equipment_name: string;
    farmer_name: string;
    farmer_contact: string;
    requested_date: string;
    status: string;
  }>;
  auditLogs: Array<{
    id: number;
    actor_name: string;
    action: string;
    entity_type: string;
    entity_id: string;
    details: string;
    created_at: string;
  }>;
  system: {
    weatherCacheCount: number;
    agmarknetApiKeyConfigured: boolean;
    googleAuthConfigured?: boolean;
    serverTime: string;
  };
}

export const AdminPage: React.FC<{ user: UserProfile | null; onDataMutated: () => void }> = ({ user, onDataMutated }) => {
  const isAdmin = user?.role === 'admin';
  const [data, setData] = useState<AdminOverview | null>(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'approvals' | 'farmers' | 'market' | 'audit'>('approvals');

  // Add Market Price form
  const [apmc, setApmc] = useState('Sira APMC');
  const [cropCode, setCropCode] = useState('ragi');
  const [modalPrice, setModalPrice] = useState('3800');
  const [reportedDate, setReportedDate] = useState(new Date().toISOString().slice(0, 10));

  const loadOverview = async () => {
    if (!isAdmin) return;
    try {
      const res = await apiFetch<AdminOverview>('/api/admin/overview');
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Admin access failed');
    }
  };

  useEffect(() => {
    if (!isAdmin) return;
    loadOverview();
  }, [isAdmin]);

  const handleShopStatus = async (id: number, status: 'verified' | 'rejected') => {
    await apiFetch(`/api/admin/shops/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ verification_status: status }),
    });
    await loadOverview();
    onDataMutated();
  };

  const handleRentalStatus = async (id: number, verification_status: 'verified' | 'rejected', availability_status?: 'confirmed' | 'unconfirmed') => {
    await apiFetch(`/api/admin/rentals/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ verification_status, availability_status }),
    });
    await loadOverview();
    onDataMutated();
  };

  const handleAddPrice = async (e: React.FormEvent) => {
    e.preventDefault();
    await apiFetch('/api/admin/market-prices', {
      method: 'POST',
      body: JSON.stringify({
        apmc_name: apmc,
        district: 'Tumakuru',
        crop_code: cropCode,
        crop_name_en: cropCode.toUpperCase(),
        crop_name_kn: cropCode,
        modal_price: Number(modalPrice),
        min_price: Math.round(Number(modalPrice) * 0.92),
        max_price: Math.round(Number(modalPrice) * 1.07),
        reported_date: reportedDate,
      }),
    });
    await loadOverview();
    onDataMutated();
  };

  if (!isAdmin) {
    return (
      <div className="bg-white rounded-2xl border border-red-200 p-6 space-y-2">
        <h1 className="text-lg font-bold text-red-900 flex items-center gap-2">
          <Shield className="w-5 h-5 text-red-700" />
          <span>403 Forbidden — Administrator Access Required</span>
        </h1>
        <p className="text-sm text-red-800">
          This administration console is restricted to authorized Krishi Mitra administrators.
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-2xl border border-red-200 p-6 text-sm text-red-800">
        {error}
      </div>
    );
  }

  if (!data) {
    return <div className="p-6 text-sm text-slate-600">Loading administration panel...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Shield className="w-6 h-6 text-[#155E34]" />
            <span>Krishi Mitra Administration</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1 tabular-nums">
            Registered accounts: {data.farmers.length} · Google Sign-In:{' '}
            {data.system.googleAuthConfigured ? 'Configured' : 'GOOGLE_CLIENT_ID Not Set'} · Weather cache:{' '}
            {data.system.weatherCacheCount}
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-xl">
          {(['approvals', 'farmers', 'market', 'audit'] as const).map((tKey) => (
            <button
              key={tKey}
              onClick={() => setTab(tKey)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg capitalize ${
                tab === tKey ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
              }`}
            >
              {tKey}
            </button>
          ))}
        </div>
      </div>

      {tab === 'approvals' && (
        <div className="grid lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
            <h2 className="text-base font-bold text-slate-900">Agro Shop Directory Verification</h2>
            <div className="divide-y divide-slate-100">
              {data.shops.map((s) => (
                <div key={s.id} className="py-3 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{s.name}</p>
                    <p className="text-xs text-slate-500">
                      {s.taluk}, {s.district} · Status: <strong>{s.verification_status}</strong>
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => handleShopStatus(s.id, 'verified')}
                      className="p-2 rounded-lg bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                      title="Verify"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleShopStatus(s.id, 'rejected')}
                      className="p-2 rounded-lg bg-red-50 text-red-700 hover:bg-red-100"
                      title="Reject"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
            <h2 className="text-base font-bold text-slate-900">Equipment Rental Approvals</h2>
            <div className="divide-y divide-slate-100">
              {data.rentals.map((r) => (
                <div key={r.id} className="py-3 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{r.equipment_name}</p>
                    <p className="text-xs text-slate-500">
                      {r.owner_name} · {r.verification_status} · Availability: {r.availability_status}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => handleRentalStatus(r.id, 'verified', 'confirmed')}
                      className="p-2 rounded-lg bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                      title="Approve & Confirm"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleRentalStatus(r.id, 'rejected', 'unconfirmed')}
                      className="p-2 rounded-lg bg-red-50 text-red-700 hover:bg-red-100"
                      title="Reject"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'farmers' && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-xs font-semibold text-slate-600 border-b border-slate-200">
              <tr>
                <th className="px-5 py-3">Name</th>
                <th className="px-4 py-3">Identifier</th>
                <th className="px-4 py-3">Auth / Verification</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Location</th>
                <th className="px-5 py-3 text-right">Acres</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.farmers.map((f) => (
                <tr key={f.id}>
                  <td className="px-5 py-3 font-medium text-slate-900">{f.name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">{f.identifier}</td>
                  <td className="px-4 py-3 text-xs text-slate-600">
                    {f.auth_provider} · {f.verification_status}
                  </td>
                  <td className="px-4 py-3 text-xs uppercase text-slate-600">{f.role}</td>
                  <td className="px-4 py-3 text-xs text-slate-600">
                    {f.village}, {f.taluk}, {f.district}
                  </td>
                  <td className="px-5 py-3 text-right font-mono tabular-nums">{f.farm_size_acres}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'market' && (
        <form onSubmit={handleAddPrice} className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4 max-w-xl">
          <h2 className="text-base font-bold text-slate-900">Publish Verified APMC Price Entry</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            <input
              value={apmc}
              onChange={(e) => setApmc(e.target.value)}
              placeholder="APMC Name"
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
            <select
              value={cropCode}
              onChange={(e) => setCropCode(e.target.value)}
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm bg-white"
            >
              <option value="ragi">Ragi</option>
              <option value="groundnut">Groundnut</option>
              <option value="red_gram">Red Gram</option>
              <option value="maize">Maize</option>
              <option value="coconut">Copra / Coconut</option>
            </select>
            <input
              type="number"
              value={modalPrice}
              onChange={(e) => setModalPrice(e.target.value)}
              placeholder="Modal Price (₹/qtl)"
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm tabular-nums"
            />
            <input
              type="date"
              value={reportedDate}
              onChange={(e) => setReportedDate(e.target.value)}
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm tabular-nums"
            />
          </div>
          <button type="submit" className="rounded-xl bg-[#155E34] px-4 py-2 text-sm font-semibold text-white">
            Publish APMC Entry
          </button>
        </form>
      )}

      {tab === 'audit' && (
        <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100">
          {data.auditLogs.length === 0 ? (
            <p className="p-6 text-sm text-slate-500">No administrative audit entries recorded yet.</p>
          ) : (
            data.auditLogs.map((log) => (
              <div key={log.id} className="px-5 py-3 flex items-center justify-between text-xs">
                <div>
                  <strong className="text-slate-900">{log.action}</strong> on {log.entity_type} #{log.entity_id} by{' '}
                  <span className="text-slate-700">{log.actor_name}</span>
                  {log.details && <span className="text-slate-500"> — {log.details}</span>}
                </div>
                <span className="font-mono text-slate-500 tabular-nums">{log.created_at}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};
