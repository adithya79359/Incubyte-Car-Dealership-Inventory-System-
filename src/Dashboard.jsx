import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';

const money = value => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(value);
const blankFilters = { make: '', model: '', category: '', minPrice: '', maxPrice: '' };

function CarIllustration() {
  return <svg viewBox="0 0 400 160" fill="none" aria-hidden="true" className="car-illustration"><ellipse cx="201" cy="131" rx="160" ry="9" fill="currentColor" opacity=".08" /><path d="M41 103 55 77l66-11 39-38h90l55 40 43 13 13 29-15 12H48z" fill="currentColor" opacity=".15" /><path d="m135 66 33-29h74l41 29z" fill="currentColor" opacity=".35" /><path d="M208 38v29M62 91h38M323 91h23M125 109h151" stroke="currentColor" strokeWidth="3" opacity=".5" /><circle cx="103" cy="116" r="23" fill="currentColor" /><circle cx="302" cy="116" r="23" fill="currentColor" /><circle cx="103" cy="116" r="11" fill="#f5f5ee" /><circle cx="302" cy="116" r="11" fill="#f5f5ee" /></svg>;
}

function ActionDialog({ action, busy, error, close, confirm }) {
  const ref = useRef(null);
  const { kind, vehicle } = action;
  const editing = kind === 'edit' || kind === 'add';
  const title = { add: 'Add a vehicle', edit: 'Edit vehicle', purchase: 'Confirm purchase', restock: 'Restock vehicle', delete: 'Delete vehicle?' }[kind];
  useEffect(() => {
    const dialog = ref.current;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  function submit(event) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    if (editing) { values.price = Number(values.price); values.quantity = Number(values.quantity); }
    else if (kind !== 'delete') values.quantity = Number(values.quantity);
    confirm(values);
  }
  return <dialog ref={ref} className="action-dialog" aria-labelledby="dialog-title" onCancel={event => { event.preventDefault(); if (!busy) close(); }}>
    <div className="flex items-start justify-between gap-4 mb-5"><div><p className="eyebrow mb-2">MOTORLANE {editing || kind === 'restock' ? 'INVENTORY' : 'COLLECTION'}</p><h2 id="dialog-title" className="text-2xl font-medium">{title}</h2></div><button className="icon-button" aria-label="Close dialog" disabled={busy} onClick={close}>×</button></div>
    {vehicle && <p className="text-stone-600 mb-5 break-words">{vehicle.make} {vehicle.model} · {money(vehicle.price)}</p>}
    {kind === 'delete' && <p className="mb-5 text-sm text-stone-600">This removes the vehicle from the inventory. This action cannot be undone.</p>}
    {kind === 'purchase' && <p className="mb-5 text-sm text-stone-600">Confirm to reduce available stock. No payment is collected here.</p>}
    <form onSubmit={submit}>
      <fieldset disabled={busy} className="space-y-4">
        {editing ? <>
          {['make', 'model', 'category'].map(field => <label key={field} className="field">{field[0].toUpperCase() + field.slice(1)}<input name={field} defaultValue={vehicle?.[field] || ''} required maxLength={100} pattern=".*\S.*" /></label>)}
          <div className="grid grid-cols-2 gap-4"><label className="field">Price (INR)<input name="price" type="number" min="0" max="9999999999.99" step="0.01" defaultValue={vehicle?.price ?? ''} required /></label><label className="field">Stock quantity<input name="quantity" type="number" min="0" max="2147483647" step="1" defaultValue={vehicle?.quantity ?? 0} required /></label></div>
        </> : kind !== 'delete' && <label className="field">Quantity<input name="quantity" aria-label="Quantity" type="number" min="1" max={kind === 'purchase' ? vehicle.quantity : 2147483647 - vehicle.quantity} step="1" defaultValue="1" required /><span className="block font-normal text-stone-500 mt-2">Currently {vehicle.quantity} in stock</span></label>}
        {error && <p role="alert" className="error">{error}</p>}
        <div className="flex gap-3 pt-3"><button type="button" className="secondary-button flex-1" onClick={close}>Cancel</button><button className={`submit flex-1 ${kind === 'delete' ? 'danger-button' : ''}`} type="submit">{busy ? 'Saving…' : { add: 'Add vehicle', edit: 'Save changes', purchase: 'Confirm purchase', restock: 'Add stock', delete: 'Delete vehicle' }[kind]}</button></div>
      </fieldset>
    </form>
  </dialog>;
}

export default function Dashboard({ session, onSignOut }) {
  const admin = session.user.role === 'admin';
  const [manage, setManage] = useState(false);
  const [filters, setFilters] = useState(blankFilters);
  const [query, setQuery] = useState('');
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [action, setAction] = useState(null);
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const mutationLock = useRef(false);
  const handleFailure = useCallback(failure => {
    if (failure.status === 401) onSignOut('Your session has expired. Please sign in again.');
  }, [onSignOut]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    api(`/vehicles/search${query ? `?${query}` : ''}`, { token: session.token, signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) setVehicles(data.vehicles); })
      .catch(failure => { if (failure.name !== 'AbortError') { setVehicles([]); setError(failure.message); handleFailure(failure); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [query, revision, session.token, handleFailure]);

  function search(event) {
    event.preventDefault();
    if (filters.minPrice !== '' && filters.maxPrice !== '' && Number(filters.minPrice) > Number(filters.maxPrice)) {
      setError('Minimum price cannot exceed maximum price.'); return;
    }
    setNotice('');
    setQuery(new URLSearchParams(Object.entries(filters).filter(([, value]) => value.trim()).map(([key, value]) => [key, value.trim()])).toString());
    setRevision(value => value + 1);
  }
  function open(kind, vehicle) { setActionError(''); setNotice(''); setAction({ kind, vehicle }); }
  async function confirm(body) {
    if (mutationLock.current) return;
    mutationLock.current = true; setBusy(true); setActionError('');
    const { kind, vehicle } = action;
    const path = kind === 'add' ? '/vehicles' : `/vehicles/${vehicle.id}${['purchase', 'restock'].includes(kind) ? `/${kind}` : ''}`;
    try {
      await api(path, { token: session.token, method: kind === 'edit' ? 'PUT' : kind === 'delete' ? 'DELETE' : 'POST', ...(kind === 'delete' ? {} : { body }) });
      setAction(null);
      setNotice({ add: 'Vehicle added to inventory.', edit: 'Vehicle updated.', delete: 'Vehicle deleted.', purchase: 'Purchase confirmed. Stock has been updated.', restock: 'Stock added successfully.' }[kind]);
      setRevision(value => value + 1);
    } catch (failure) {
      handleFailure(failure); setActionError(failure.message);
      if ([403, 404, 409].includes(failure.status)) setRevision(value => value + 1);
    } finally { mutationLock.current = false; setBusy(false); }
  }
  const units = vehicles.reduce((sum, vehicle) => sum + vehicle.quantity, 0);
  return <div className="dashboard min-h-screen">
    <a href="#inventory" className="skip-link">Skip to vehicles</a>
    <header className="dashboard-header"><div className="dashboard-container flex flex-wrap items-center justify-between gap-4 py-5">
      <a href="#inventory" className="brand"><span className="brand-icon">m</span>motorlane<span className="brand-dot">.</span></a>
      <div className="flex items-center gap-4"><span className="account-name text-sm">{session.user.name}<span className="block text-xs text-stone-500">{admin ? 'Administrator' : 'Your personal showroom'}</span></span><button className="secondary-button" onClick={() => onSignOut()}>Sign out</button></div>
    </div></header>
    <main className="dashboard-container py-8 md:py-12" id="inventory">
      <section className="dashboard-hero flex flex-wrap justify-between items-center gap-8 mb-8"><div><p className="eyebrow mb-4">{manage ? 'YOUR INVENTORY, AT A GLANCE' : 'FIND YOUR NEXT CHAPTER'}</p><h1 className="text-3xl md:text-5xl tracking-tight mb-4">{manage ? 'Keep your showroom moving.' : 'A great drive starts here.'}</h1><p className="text-sm md:text-base text-[#becdc3] max-w-xl">{manage ? 'Manage your collection, update vehicle details, and keep stock ready for the road.' : 'Explore the collection. Find your fit. Make your next move.'}</p></div><span className="hero-emblem" aria-hidden="true">↗</span></section>
      {admin && <nav className="flex flex-wrap justify-between gap-4 mb-7" aria-label="Dashboard views"><div className="tabs flex mb-0 w-full sm:w-80"><button aria-pressed={!manage} onClick={() => setManage(false)}>Browse vehicles</button><button aria-pressed={manage} onClick={() => setManage(true)}>Manage inventory</button></div>{manage && <button className="submit w-auto" onClick={() => open('add')}>+ Add vehicle</button>}</nav>}
      <section className="grid grid-cols-3 gap-3 md:gap-5 mb-8" aria-label="Current results summary">{[['Vehicles', vehicles.length], ['Units in stock', units], ['Out of stock', vehicles.filter(vehicle => !vehicle.quantity).length]].map(([label, value]) => <div className="stat" key={label}><p>{label}</p><strong>{loading ? '—' : value}</strong></div>)}</section>
      <section className="filter-panel mb-8" aria-labelledby="filter-title"><div className="flex justify-between gap-4 mb-5"><h2 id="filter-title" className="font-semibold">Find the right vehicle</h2><button className="text-link text-xs" type="button" onClick={() => { setFilters(blankFilters); setQuery(''); setRevision(value => value + 1); setNotice(''); }}>Clear filters</button></div>
        <form onSubmit={search} className="filter-grid">{Object.keys(blankFilters).map(key => <label key={key} className="field">{{ make: 'Make', model: 'Model', category: 'Category', minPrice: 'Min price (INR)', maxPrice: 'Max price (INR)' }[key]}<input type={key.includes('Price') ? 'number' : 'text'} min={key.includes('Price') ? '0' : undefined} max={key.includes('Price') ? '9999999999.99' : undefined} step={key.includes('Price') ? '0.01' : undefined} maxLength={100} placeholder={{ make: 'e.g. Toyota', model: 'e.g. Camry', category: 'e.g. Sedan', minPrice: 'No minimum', maxPrice: 'No maximum' }[key]} value={filters[key]} onChange={event => setFilters({ ...filters, [key]: event.target.value })} /></label>)}<button type="submit" className="submit self-end">Search <span aria-hidden="true">↗</span></button></form>
      </section>
      {notice && <p role="status" className="success mb-6">{notice}</p>}
      {error && <div role="alert" className="error mb-6 flex justify-between gap-4"><span>{error}</span><button className="text-link" onClick={() => setRevision(value => value + 1)}>Retry</button></div>}
      <div className="flex justify-between items-center mb-5"><h2 className="text-xl font-medium">{manage ? 'Inventory' : 'The collection'}</h2><p className="text-xs text-stone-500">{loading ? 'Loading vehicles…' : `${vehicles.length} ${vehicles.length === 1 ? 'vehicle' : 'vehicles'}${query ? ' found' : ''}`}</p></div>
      {loading ? <div className="empty-state" role="status">Loading your collection…</div> : !vehicles.length ? <div className="empty-state"><p className="text-2xl mb-3">{error ? 'Unable to load vehicles' : query ? 'No matches just yet.' : 'The showroom is getting ready.'}</p><p className="text-stone-500">{error ? 'Please retry when your connection is ready.' : query ? 'Try another make, category, or price range.' : manage ? 'Add your first vehicle to start managing inventory.' : 'Check back soon for available vehicles.'}</p>{manage && !query && !error && <button className="text-link mt-5" onClick={() => open('add')}>Add your first vehicle</button>}</div> : <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6" aria-label="Vehicles">
        {vehicles.map(vehicle => <article className="vehicle-card" key={vehicle.id} aria-label={`${vehicle.make} ${vehicle.model}`}>
          <div className="vehicle-art"><span className="category-badge">{vehicle.category}</span><CarIllustration /><span className="illustration-note">Illustration</span></div>
          <div className="p-6"><div className="flex justify-between items-start gap-3 mb-5"><div className="min-w-0"><p className="eyebrow text-stone-500 mb-2 break-words">{vehicle.make}</p><h3 className="text-2xl font-medium break-words">{vehicle.model}</h3></div><span className={`stock-badge ${vehicle.quantity ? '' : 'sold-out'}`}>{vehicle.quantity ? `${vehicle.quantity} in stock` : 'Out of stock'}</span></div><p className="text-2xl font-semibold mb-6 break-words">{money(vehicle.price)}</p>
            {manage ? <><div className="flex gap-2"><button className="secondary-button flex-1" onClick={() => open('edit', vehicle)}>Edit</button><button className="submit flex-1" disabled={vehicle.quantity === 2147483647} onClick={() => open('restock', vehicle)}>Restock</button></div><button className="delete-link mt-4" onClick={() => open('delete', vehicle)}>Delete vehicle</button></> : <button className="submit" disabled={!vehicle.quantity} onClick={() => open('purchase', vehicle)}>{vehicle.quantity ? 'Purchase' : 'Out of stock'}<span aria-hidden="true">↗</span></button>}
          </div>
        </article>)}
      </section>}
      <footer className="dashboard-footer">Motorlane · Made for the road ahead.<span>Prices shown in INR</span></footer>
    </main>
    {action && <ActionDialog action={action} busy={busy} error={actionError} close={() => setAction(null)} confirm={confirm} />}
  </div>;
}
