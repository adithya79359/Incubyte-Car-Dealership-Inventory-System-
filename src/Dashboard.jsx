import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';
import { ThemeToggle } from './Theme';

const money = value => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(value);
const blankFilters = { make: '', model: '', category: '', minPrice: '', maxPrice: '' };

function CarIllustration() {
  return <svg viewBox="0 0 400 160" fill="none" aria-hidden="true" className="car-illustration"><ellipse cx="201" cy="131" rx="160" ry="9" fill="currentColor" opacity=".08" /><path d="M41 103 55 77l66-11 39-38h90l55 40 43 13 13 29-15 12H48z" fill="currentColor" opacity=".15" /><path d="m135 66 33-29h74l41 29z" fill="currentColor" opacity=".35" /><path d="M208 38v29M62 91h38M323 91h23M125 109h151" stroke="currentColor" strokeWidth="3" opacity=".5" /><circle cx="103" cy="116" r="23" fill="currentColor" /><circle cx="302" cy="116" r="23" fill="currentColor" /><circle cx="103" cy="116" r="11" fill="#f5f5ee" /><circle cx="302" cy="116" r="11" fill="#f5f5ee" /></svg>;
}

function VehicleImage({ imageUrl, make, model }) {
  const [failed, setFailed] = useState(false);
  return imageUrl && !failed
    ? <img className="vehicle-photo" src={imageUrl} alt={`${make} ${model}`} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
    : <><CarIllustration /><span className="illustration-note">Illustration</span></>;
}

function ActionDialog({ action, busy, error, close, confirm }) {
  const ref = useRef(null);
  const { kind, vehicle } = action;
  const [imageUrl, setImageUrl] = useState(vehicle?.imageUrl || '');
  const editing = kind === 'edit' || kind === 'add';
  const title = { add: 'Add a vehicle', edit: 'Edit vehicle', purchase: 'Confirm purchase', restock: 'Restock vehicle', delete: 'Delete vehicle?', details: 'Vehicle details' }[kind];
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
    {kind === 'details' ? <><div className="vehicle-art details-photo"><VehicleImage key={vehicle.imageUrl || 'default'} imageUrl={vehicle.imageUrl} make={vehicle.make} model={vehicle.model} /></div><dl className="vehicle-details"><div><dt>Make</dt><dd>{vehicle.make}</dd></div><div><dt>Model</dt><dd>{vehicle.model}</dd></div><div><dt>Category</dt><dd>{vehicle.category}</dd></div><div><dt>Price</dt><dd>{money(vehicle.price)}</dd></div><div><dt>Availability</dt><dd>{vehicle.quantity ? vehicle.quantity + ' in stock' : 'Out of stock'}</dd></div></dl><button className="secondary-button w-full" onClick={close}>Close details</button></> : <form onSubmit={submit}>
      <fieldset disabled={busy} className="space-y-4">
        {editing ? <>
          {['make', 'model', 'category'].map(field => <label key={field} className="field">{field[0].toUpperCase() + field.slice(1)}<input name={field} defaultValue={vehicle?.[field] || ''} required maxLength={100} pattern=".*\S.*" /></label>)}
          <div className="grid grid-cols-2 gap-4"><label className="field">Price (INR)<input name="price" type="number" min="0" max="9999999999.99" step="0.01" defaultValue={vehicle?.price ?? ''} required /></label><label className="field">Stock quantity<input name="quantity" type="number" min="0" max="2147483647" step="1" defaultValue={vehicle?.quantity ?? 0} required /></label></div>
          <div className="image-editor"><label className="field">Vehicle image URL (optional)<input name="imageUrl" type="url" pattern="https://.*" maxLength={2048} placeholder="https://example.com/your-car.jpg" value={imageUrl} onChange={event => setImageUrl(event.target.value)} aria-describedby="image-help" /></label><p id="image-help" className="image-help">Use a direct HTTPS image link. Leave empty to use the Motorlane illustration.</p><div className="vehicle-art image-preview"><VehicleImage key={imageUrl} imageUrl={imageUrl.startsWith('https://') ? imageUrl : null} make={vehicle?.make || 'Vehicle'} model={vehicle?.model || 'preview'} /></div>{imageUrl && <button type="button" className="text-link text-xs mt-3" onClick={() => setImageUrl('')}>Remove image</button>}</div>
        </> : kind !== 'delete' && <label className="field">Quantity<input name="quantity" aria-label="Quantity" type="number" min="1" max={kind === 'purchase' ? vehicle.quantity : 2147483647 - vehicle.quantity} step="1" defaultValue="1" required /><span className="block font-normal text-stone-500 mt-2">Currently {vehicle.quantity} in stock</span></label>}
        {error && <p role="alert" className="error">{error}</p>}
        <div className="flex gap-3 pt-3"><button type="button" className="secondary-button flex-1" onClick={close}>Cancel</button><button className={`submit flex-1 ${kind === 'delete' ? 'danger-button' : ''}`} type="submit">{busy ? 'Saving…' : { add: 'Add vehicle', edit: 'Save changes', purchase: 'Confirm purchase', restock: 'Add stock', delete: 'Delete vehicle' }[kind]}</button></div>
      </fieldset>
    </form>}
  </dialog>;
}

export default function Dashboard({ session, onSignOut }) {
  const admin = session.user.role === 'admin';
  const [manage, setManage] = useState(false);
  const [categoryTab, setCategoryTab] = useState('');
  const [sort, setSort] = useState('featured');
  const [layout, setLayout] = useState('grid');
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
    setNotice(''); setCategoryTab('');
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
  const categories = [...new Set(vehicles.map(vehicle => vehicle.category))];
  const visibleVehicles = vehicles.filter(vehicle => !categoryTab || vehicle.category === categoryTab).sort((a,b) => sort === 'price-asc' ? a.price-b.price : sort === 'price-desc' ? b.price-a.price : a.id-b.id);
  const featuredVehicle = vehicles.find(vehicle => vehicle.imageUrl);
  return <div className={`dashboard min-h-screen ${manage ? 'management-view' : 'showroom-view'}`}>
    <a href="#inventory" className="skip-link">Skip to vehicles</a>
    <header className="dashboard-header"><div className="dashboard-container flex flex-wrap items-center justify-between gap-4 py-5">
      <a href="#inventory" className="brand"><span className="brand-icon">m</span>motorlane<span className="brand-dot">.</span></a>
      <div className="header-actions flex items-center gap-4"><ThemeToggle /><span className="account-name text-sm">{session.user.name}<span className="block text-xs text-stone-500">{admin ? 'Administrator' : 'Your personal showroom'}</span></span><button className="secondary-button" onClick={() => onSignOut()}>Sign out</button></div>
    </div></header>
    <main className="dashboard-container py-8 md:py-12" id="inventory">
      <div className="welcome-row"><div><p className="eyebrow">YOUR MOTORLANE</p><p className="welcome-message">Welcome back, <strong>{session.user.name}</strong><span className="welcome-dot" aria-hidden="true">.</span></p></div><span className="welcome-caption">A little closer to your next adventure.</span></div>
      {!manage ? <section className="showroom-hero" aria-labelledby="showroom-title"><div className="hero-vehicle"><VehicleImage key={featuredVehicle?.imageUrl || 'hero-default'} imageUrl={featuredVehicle?.imageUrl} make={featuredVehicle?.make || 'Motorlane'} model={featuredVehicle?.model || 'collection'} /></div><div className="hero-shade" /><div className="showroom-hero-copy"><p className="eyebrow">PREMIUM CARS. REAL EXPERIENCES.</p><h1 id="showroom-title">Find your<br />next adventure.</h1><p>Explore our collection of vehicles.<br />Your next chapter begins with the right drive.</p><a href="#collection" className="explore-button">Explore Collection <span aria-hidden="true">→</span></a><div className="hero-benefits"><span><b aria-hidden="true">◇</b><span>Clear choices<small>Price & stock upfront</small></span></span><span><b aria-hidden="true">↗</b><span>Your next drive<small>{vehicles.length} vehicles to explore</small></span></span><span><b aria-hidden="true">✓</b><span>Simple & secure<small>Purchase with confidence</small></span></span></div></div><div className="hero-caption">Drive<br /><strong>Your Dream</strong><i /></div></section> : <section className="dashboard-hero flex flex-wrap justify-between items-center gap-8 mb-8"><div><p className="eyebrow mb-4">{manage ? 'YOUR INVENTORY, AT A GLANCE' : 'FIND YOUR NEXT CHAPTER'}</p><h1 className="text-3xl md:text-5xl tracking-tight mb-4">{manage ? 'Keep your showroom moving.' : 'A great drive starts here.'}</h1><p className="text-sm md:text-base text-[#becdc3] max-w-xl">{manage ? 'Manage your collection, update vehicle details, and keep stock ready for the road.' : 'Explore the collection. Find your fit. Make your next move.'}</p></div><div className="hero-signature" aria-hidden="true"><span className="hero-emblem">↗</span><span>THE MOTORLANE COLLECTION</span></div></section>}
      {admin && <nav className="flex flex-wrap justify-between gap-4 mb-7" aria-label="Dashboard views"><div className="tabs flex mb-0 w-full sm:w-80"><button aria-pressed={!manage} onClick={() => setManage(false)}>Browse vehicles</button><button aria-pressed={manage} onClick={() => setManage(true)}>Manage inventory</button></div>{manage && <button className="submit w-auto" onClick={() => open('add')}>+ Add vehicle</button>}</nav>}
      {manage && <section className="grid grid-cols-3 gap-3 md:gap-5 mb-8" aria-label="Current results summary">{[['Vehicles', vehicles.length], ['Units in stock', units], ['Out of stock', vehicles.filter(vehicle => !vehicle.quantity).length]].map(([label, value]) => <div className="stat" key={label}><p>{label}</p><strong>{loading ? '—' : value}</strong></div>)}</section>}
      <section className="filter-panel mb-8" aria-labelledby="filter-title"><div className="flex justify-between gap-4 mb-5"><h2 id="filter-title" className="font-semibold">Find the right vehicle</h2><button className="text-link text-xs" type="button" onClick={() => { setFilters(blankFilters); setCategoryTab(''); setQuery(''); setRevision(value => value + 1); setNotice(''); }}>Clear filters</button></div>
        <form onSubmit={search} className="filter-grid">{Object.keys(blankFilters).map(key => <label key={key} className="field">{{ make: 'Make', model: 'Model', category: 'Category', minPrice: 'Min price (INR)', maxPrice: 'Max price (INR)' }[key]}<input type={key.includes('Price') ? 'number' : 'text'} min={key.includes('Price') ? '0' : undefined} max={key.includes('Price') ? '9999999999.99' : undefined} step={key.includes('Price') ? '0.01' : undefined} maxLength={100} placeholder={{ make: 'e.g. Toyota', model: 'e.g. Camry', category: 'e.g. Sedan', minPrice: 'No minimum', maxPrice: 'No maximum' }[key]} value={filters[key]} onChange={event => setFilters({ ...filters, [key]: event.target.value })} /></label>)}<button type="submit" className="submit self-end">Search <span aria-hidden="true">↗</span></button></form>
      </section>
      {notice && <p role="status" className="success mb-6">{notice}</p>}
      {error && <div role="alert" className="error mb-6 flex justify-between gap-4"><span>{error}</span><button className="text-link" onClick={() => setRevision(value => value + 1)}>Retry</button></div>}
      <div className="collection-toolbar" id="collection"><div><h2>{manage ? 'Inventory' : 'Our Collection'}</h2><p>{loading ? 'Loading vehicles…' : 'Discover vehicles for your next chapter.'}</p></div>{!manage && <><div className="category-tabs" aria-label="Vehicle categories"><button aria-pressed={!categoryTab} onClick={() => setCategoryTab('')}>All ({vehicles.length})</button>{categories.map(category => <button key={category} aria-pressed={categoryTab === category} onClick={() => setCategoryTab(category)}>{category} ({vehicles.filter(vehicle => vehicle.category === category).length})</button>)}</div><div className="collection-controls"><select aria-label="Sort vehicles" value={sort} onChange={event => setSort(event.target.value)}><option value="featured">Featured</option><option value="price-asc">Price: Low to High</option><option value="price-desc">Price: High to Low</option></select><div className="layout-switch" aria-label="Collection layout"><button aria-label="Grid view" aria-pressed={layout === 'grid'} onClick={() => setLayout('grid')}>▦</button><button aria-label="List view" aria-pressed={layout === 'list'} onClick={() => setLayout('list')}>☷</button></div></div></>}</div>
      {loading ? <div className="empty-state" role="status">Loading your collection…</div> : !visibleVehicles.length ? <div className="empty-state"><p className="text-2xl mb-3">{error ? 'Unable to load vehicles' : (query || categoryTab) ? 'No matches just yet.' : 'The showroom is getting ready.'}</p><p className="text-stone-500">{error ? 'Please retry when your connection is ready.' : (query || categoryTab) ? 'Try another make, category, or price range.' : manage ? 'Add your first vehicle to start managing inventory.' : 'Check back soon for available vehicles.'}</p>{manage && !query && !error && <button className="text-link mt-5" onClick={() => open('add')}>Add your first vehicle</button>}</div> : <section className={manage ? "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6" : `showroom-grid ${layout === "list" ? "showroom-list" : ""}`} aria-label="Vehicles">
        {visibleVehicles.map(vehicle => <article className="vehicle-card" key={vehicle.id} aria-label={`${vehicle.make} ${vehicle.model}`}>
          <div className="vehicle-art"><span className="category-badge">{vehicle.category}</span><VehicleImage key={vehicle.imageUrl || "default"} imageUrl={vehicle.imageUrl} make={vehicle.make} model={vehicle.model} /></div>
          <div className="p-6 vehicle-card-body"><div className="flex justify-between items-start gap-3 mb-5"><div className="min-w-0"><p className="eyebrow text-stone-500 mb-2 break-words">{vehicle.make}</p><h3 className="text-2xl font-medium break-words">{vehicle.model}</h3></div><span className={`stock-badge ${vehicle.quantity ? '' : 'sold-out'}`}>{vehicle.quantity ? `${vehicle.quantity} in stock` : 'Out of stock'}</span></div><div className="vehicle-price"><span>VEHICLE PRICE</span><p>{money(vehicle.price)}</p></div>
            {manage ? <><div className="flex gap-2"><button className="secondary-button flex-1" onClick={() => open('edit', vehicle)}>Edit</button><button className="submit flex-1" disabled={vehicle.quantity === 2147483647} onClick={() => open('restock', vehicle)}>Restock</button></div><button className="delete-link mt-4" onClick={() => open('delete', vehicle)}>Delete vehicle</button></> : <div className="customer-card-actions"><button className="secondary-button" onClick={() => open('details', vehicle)}>View Details</button><button className="submit" disabled={!vehicle.quantity} onClick={() => open('purchase', vehicle)}>{vehicle.quantity ? 'Purchase' : 'Out of stock'}<span aria-hidden="true">↗</span></button></div>}
          </div>
        </article>)}
      </section>}
      <footer className="dashboard-footer">Motorlane · Made for the road ahead.<span>Prices shown in INR</span></footer>
    </main>
    {action && <ActionDialog action={action} busy={busy} error={actionError} close={() => setAction(null)} confirm={confirm} />}
  </div>;
}
