// ====== Proste „repozytorium” danych w localStorage ======
const LS = {
  load(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
  },
  save(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
};

// ====== MODELE / STAN ======
let state = LS.load('state', {
  categories: [],
  products: [],
  promotions: [],
  transactions: [],
  inventoryOps: [],
  orders: [],
  refunds: [],
  shifts: [],
  profile: { name: 'Kasjer', email: '', businessName: '' }
});

let cart = LS.load('cart', []);

// ====== Inicjalizacja danych startowych ======
function bootstrap() {
  if (state.categories.length === 0) {
    state.categories = [
      { id: uuid(), name: 'Jedzenie' },
      { id: uuid(), name: 'Napoje' },
      { id: uuid(), name: 'Usługi' }
    ];
  }
  if (state.products.length === 0) {
    const [food, drinks, services] = state.categories;
    state.products = [
      { id: uuid(), name: 'Kanapka', sku: 'SND001', categoryId: food.id, price: 12.00, stock: 20, taxable: true, isService: false },
      { id: uuid(), name: 'Kawa', sku: 'DRK001', categoryId: drinks.id, price: 7.50, stock: 50, taxable: true, isService: false },
      { id: uuid(), name: 'Dostawa lokalna', sku: 'SRV001', categoryId: services.id, price: 15.00, stock: 9999, taxable: false, isService: true }
    ];
  }
  LS.save('state', state);
}
bootstrap();

// ====== Narzędzia ======
function uuid() { return crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2); }
function fmt(n) { return Number(n || 0).toFixed(2); }
function dec(str) {
  if (!str) return 0;
  const cleaned = String(str).replace(',', '.').trim();
  const v = parseFloat(cleaned);
  return isNaN(v) ? 0 : v;
}
function byId(id) { return state.products.find(p => p.id === id); }

function saveAll() {
  LS.save('state', state);
  LS.save('cart', cart);
  renderAll();
  status('Zapisano zmiany');
}

function status(msg) {
  const el = document.getElementById('status-msg');
  el.textContent = msg;
  setTimeout(() => { el.textContent = ''; }, 2500);
}

// ====== KOSZYK / PROMOCJE ======
function cartSubtotalBefore() {
  return cart.reduce((sum, it) => sum + it.price * it.qty, 0);
}
function cartSubtotalAfter() {
  return cart.reduce((sum, it) => sum + (it.price - (it.discount || 0)) * it.qty, 0);
}
function cartTotalDiscount() {
  return cartSubtotalBefore() - cartSubtotalAfter();
}

function applyPromotions() {
  // Zeruj rabaty
  cart = cart.map(it => ({ ...it, discount: 0 }));

  const active = state.promotions.filter(p => p.active !== false).filter(p => {
    if (p.expiresAt && new Date(p.expiresAt) < new Date()) return false;
    const subtotal = cartSubtotalBefore();
    if (p.minTotal && subtotal < p.minTotal) return false;
    const qtyTotal = cart.reduce((s, it) => s + it.qty, 0);
    if (p.minQty && qtyTotal < p.minQty) return false;
    if (p.productIds && !cart.some(it => p.productIds.includes(it.productId))) return false;
    return true;
  });

  active.forEach(p => {
    if (p.percentOff) {
      cart = cart.map(it => {
        if (p.productIds && !p.productIds.includes(it.productId)) return it;
        const off = it.price * (p.percentOff / 100.0);
        return { ...it, discount: Math.max(it.discount || 0, off) };
      });
    } else if (p.fixedOff) {
      const idx = cart.findIndex(it => !p.productIds || p.productIds.includes(it.productId));
      if (idx >= 0) {
        const off = Math.min(cart[idx].price, p.fixedOff);
        cart[idx].discount = Math.max(cart[idx].discount || 0, off);
      }
    }
  });
}

// ====== UI: zakładki ======
document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(s => s.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
    renderAll();
  });
});

// ====== RENDER: Sprzedaż ======
function renderCategories() {
  const ul = document.getElementById('category-list');
  ul.innerHTML = '';
  state.categories.forEach(cat => {
    const li = document.createElement('li');
    li.innerHTML = `<span>${cat.name}</span>`;
    ul.appendChild(li);
  });
}

function renderProducts() {
  const ul = document.getElementById('product-list');
  ul.innerHTML = '';
  state.products.forEach(p => {
    const btn = document.createElement('button');
    btn.textContent = 'Dodaj';
    btn.addEventListener('click', () => addToCart(p));

    const li = document.createElement('li');
    li.innerHTML = `<span>${p.name} • ${fmt(p.price)} zł • Stock: ${p.stock}</span>`;
    li.appendChild(btn);
    ul.appendChild(li);
  });
}

function addToCart(p) {
  if (p.stock <= 0 && !p.isService) {
    alert(`Produkt '${p.name}' ma 0 na stanie. To tylko informacja.`);
    return;
  }
  const idx = cart.findIndex(it => it.productId === p.id && it.price === p.price);
  if (idx >= 0) cart[idx].qty += 1;
  else cart.push({ id: uuid(), productId: p.id, name: p.name, qty: 1, price: p.price, discount: 0, isService: !!p.isService });
  applyPromotions();
  saveAll();
}

function changeQty(itemId, q) {
  const idx = cart.findIndex(it => it.id === itemId);
  if (idx < 0) return;
  cart[idx].qty = Math.max(0, q);
  if (cart[idx].qty === 0) cart.splice(idx, 1);
  applyPromotions();
  saveAll();
}

function renderCart() {
  const ul = document.getElementById('cart-list');
  ul.innerHTML = '';
  cart.forEach(it => {
    const li = document.createElement('li');
    const before = fmt(it.price);
    const after = fmt(it.price - (it.discount || 0));
    li.innerHTML = `
      <div>
        <div><strong>${it.name}</strong></div>
        <div class="muted">${before} zł → ${after} zł • x${it.qty}${(it.discount||0)>0 ? ' • Rabat: ' + fmt(it.discount) + ' zł' : ''}</div>
      </div>
    `;
    const controls = document.createElement('div');
    const minus = document.createElement('button'); minus.textContent = '−';
    const plus = document.createElement('button'); plus.textContent = '+';
    const remove = document.createElement('button'); remove.textContent = 'Usuń';

    minus.addEventListener('click', () => changeQty(it.id, it.qty - 1));
    plus.addEventListener('click', () => changeQty(it.id, it.qty + 1));
    remove.addEventListener('click', () => { cart = cart.filter(x => x.id !== it.id); saveAll(); });

    controls.append(minus, plus, remove);
    li.appendChild(controls);
    ul.appendChild(li);
  });

  document.getElementById('sum-before').textContent = fmt(cartSubtotalBefore());
  document.getElementById('discount-total').textContent = fmt(cartTotalDiscount());
  document.getElementById('sum-after').textContent = fmt(cartSubtotalAfter());

  // Checkout change
  const cash = dec(document.getElementById('cash-paid').value);
  const card = dec(document.getElementById('card-paid').value);
  const total = cartSubtotalAfter();
  const remainingDue = Math.max(0, total - card);
  const change = Math.max(0, cash - remainingDue);
  const showChange = document.getElementById('show-change').checked;
  document.getElementById('change-amount').textContent = fmt(showChange ? change : 0);

  document.getElementById('order-cart-count').textContent = String(cart.length);
  document.getElementById('order-sum').textContent = fmt(total);
}

document.getElementById('cash-paid').addEventListener('input', renderCart);
document.getElementById('card-paid').addEventListener('input', renderCart);
document.getElementById('show-change').addEventListener('change', renderCart);

// ====== CHECKOUT / TRANSAKCJA ======
function currentOpenShift() {
  return state.shifts.find(s => s.state === 'open');
}

document.getElementById('btn-open-shift').addEventListener('click', () => {
  if (currentOpenShift()) { alert('Zmiana już otwarta'); return; }
  const openingCash = prompt('Podaj gotówkę początkową', '0,00');
  const opening = dec(openingCash);
  const shift = {
    id: uuid(),
    openedAt: new Date().toISOString(),
    openedBy: state.profile.name || 'Kasjer',
    openingCash: opening,
    closedAt: null,
    closingCash: null,
    cashSalesTotal: 0,
    cardSalesTotal: 0,
    otherSalesTotal: 0,
    notes: '',
    state: 'open',
    discrepancy: null
  };
  state.shifts.unshift(shift);
  saveAll();
});

document.getElementById('btn-checkout').addEventListener('click', () => {
  if (!currentOpenShift()) {
    alert('Otwórz zmianę kasy przed sprzedażą (Ustawienia → Zmiany kasowe lub przycisk „Otwórz zmianę”).');
    return;
  }
  if (cart.length === 0) return;

  const cash = dec(document.getElementById('cash-paid').value);
  const card = dec(document.getElementById('card-paid').value);
  const total = cartSubtotalAfter();

  const splits = [];
  if (cash > 0) splits.push({ method: 'cash', amount: cash });
  if (card > 0) splits.push({ method: 'card', amount: card });

  const tx = {
    id: uuid(),
    date: new Date().toISOString(),
    items: cart.map(it => ({ ...it })),
    customerId: null,
    splits,
    total,
    notes: currentOpenShift() ? `shift:${currentOpenShift().id}` : null,
    shiftId: currentOpenShift()?.id || null
  };
  state.transactions.unshift(tx);

  // Zmniejsz stany
  cart.forEach(it => {
    const pIdx = state.products.findIndex(p => p.id === it.productId);
    if (pIdx >= 0 && !state.products[pIdx].isService) {
      state.products[pIdx].stock -= it.qty;
      state.inventoryOps.push({
        id: uuid(),
        date: new Date().toISOString(),
        productId: it.productId,
        qtyChange: -it.qty,
        type: 'adjustment',
        note: `Sale ${tx.id.slice(0,6)}`
      });
    }
  });

  cart = [];
  document.getElementById('cash-paid').value = '';
  document.getElementById('card-paid').value = '';
  saveAll();
  alert('Sprzedaż zakończona');
});

// ====== MAGAZYN ======
function renderInventory() {
  const ul = document.getElementById('inventory-list');
  ul.innerHTML = '';
  state.products.forEach(p => {
    const li = document.createElement('li');
    li.innerHTML = `<span>${p.name} • SKU: ${p.sku || '-'} • Stock: ${p.stock}</span>`;
    const menu = document.createElement('div');

    const btnReceive = document.createElement('button'); btnReceive.textContent = 'Przyjmij';
    btnReceive.addEventListener('click', () => {
      const q = parseInt(prompt('Ilość do przyjęcia', '1'), 10);
      if (!q || q <= 0) return;
      p.stock += q;
      state.inventoryOps.push({ id: uuid(), date: new Date().toISOString(), productId: p.id, qtyChange: q, type: 'receive', note: 'Przyjęcie ręczne' });
      saveAll();
    });

    const btnLoss = document.createElement('button'); btnLoss.textContent = 'Strata';
    btnLoss.addEventListener('click', () => {
      p.stock -= 1;
      state.inventoryOps.push({ id: uuid(), date: new Date().toISOString(), productId: p.id, qtyChange: -1, type: 'loss', note: 'Strata ręczna' });
      saveAll();
    });

    const btnCount = document.createElement('button'); btnCount.textContent = 'Inwentaryzacja';
    btnCount.addEventListener('click', () => {
      const counted = parseInt(prompt('Faktyczny stan', String(p.stock)), 10);
      if (isNaN(counted)) return;
      const delta = counted - p.stock;
      p.stock = counted;
      state.inventoryOps.push({ id: uuid(), date: new Date().toISOString(), productId: p.id, qtyChange: delta, type: 'inventoryCount', note: 'Ręczna inwentaryzacja' });
      saveAll();
    });

    menu.append(btnReceive, btnLoss, btnCount);
    li.appendChild(menu);
    ul.appendChild(li);
  });
}

// ====== ZAMÓWIENIA ======
document.getElementById('order-create').addEventListener('click', () => {
  if (cart.length === 0) { alert('Koszyk jest pusty'); return; }
  const payNow = document.getElementById('order-paynow').checked;
  const notes = document.getElementById('order-notes').value.trim();
  const items = cart.map(it => ({ id: uuid(), productId: it.productId, name: it.name, qty: it.qty, price: it.price, isService: it.isService }));
  const total = cartSubtotalAfter();
  const shiftId = currentOpenShift()?.id || null;

  const order = {
    id: uuid(),
    createdAt: new Date().toISOString(),
    items,
    customerId: null,
    total,
    payNow,
    paid: !!payNow,
    status: payNow ? 'completed' : 'pending',
    notes: notes || null,
    shiftId
  };
  state.orders.unshift(order);

  if (payNow) {
    // Utwórz transakcję
    const splits = [{ method: 'card', amount: total }];
    const record = {
      id: uuid(),
      date: new Date().toISOString(),
      items: cart.map(it => ({ ...it })),
      customerId: null,
      splits,
      total,
      notes: `Order payNow:${order.id}`,
      shiftId
    };
    state.transactions.unshift(record);

    // Zmniejsz stany
    items.forEach(it => {
      const pIdx = state.products.findIndex(p => p.id === it.productId);
      if (pIdx >= 0 && !state.products[pIdx].isService) {
        state.products[pIdx].stock -= it.qty;
        state.inventoryOps.push({
          id: uuid(), date: new Date().toISOString(), productId: it.productId, qtyChange: -it.qty, type: 'adjustment', note: `OrderPayNow ${order.id.slice(0,6)}`
        });
      }
    });
  }

  cart = [];
  document.getElementById('order-notes').value = '';
  saveAll();
  alert('Zamówienie dodane');
});

function finalizePickup(orderId) {
  const order = state.orders.find(o => o.id === orderId);
  if (!order || order.paid || order.payNow) return;
  const cash = dec(prompt('Gotówka pobrana', '0,00'));
  const card = dec(prompt('Karta pobrana', '0,00'));
  const total = order.total;
  const paid = cash + card;
  if (paid < total) { alert('Kwota mniejsza niż suma zamówienia'); return; }

  const splits = [];
  if (cash > 0) splits.push({ method: 'cash', amount: cash });
  if (card > 0) splits.push({ method: 'card', amount: card });

  const tx = {
    id: uuid(),
    date: new Date().toISOString(),
    items: order.items.map(it => ({ id: uuid(), productId: it.productId, name: it.name, qty: it.qty, price: it.price, discount: 0, isService: it.isService })),
    customerId: order.customerId,
    splits,
    total,
    notes: `Order pickup:${order.id}`,
    shiftId: order.shiftId
  };
  state.transactions.unshift(tx);

  order.paid = true;
  order.status = 'completed';

  // Zmniejsz stany
  order.items.forEach(it => {
    const pIdx = state.products.findIndex(p => p.id === it.productId);
    if (pIdx >= 0 && !state.products[pIdx].isService) {
      state.products[pIdx].stock -= it.qty;
      state.inventoryOps.push({ id: uuid(), date: new Date().toISOString(), productId: it.productId, qtyChange: -it.qty, type: 'adjustment', note: `OrderPickup ${order.id.slice(0,6)}` });
    }
  });

  saveAll();
  alert('Zamówienie zakończone i opłacone przy odbiorze');
}

function renderOrders() {
  const ul = document.getElementById('orders-list');
  ul.innerHTML = '';
  state.orders.forEach(o => {
    const li = document.createElement('li');
    const status = `${o.payNow ? 'PŁATNE' : 'NA ODBIÓR'} • ${o.status}`;
    li.innerHTML = `<span><strong>${status}</strong><br/><span class="muted">${fmt(o.total)} zł • ${new Date(o.createdAt).toLocaleString()}</span></span>`;
    const btn = document.createElement('button');
    btn.textContent = (!o.paid && !o.payNow) ? 'Finalizuj odbiór' : 'Szczegóły';
    btn.addEventListener('click', () => {
      if (!o.paid && !o.payNow) finalizePickup(o.id);
      else alert(`Zamówienie: ${o.id.slice(0,6)} • ${fmt(o.total)} zł`);
    });
    li.appendChild(btn);
    ul.appendChild(li);
  });
}

// ====== PROMOCJE ======
document.getElementById('promo-add').addEventListener('click', () => {
  const name = document.getElementById('promo-name').value.trim();
  const pct = dec(document.getElementById('promo-pct').value);
  const fixed = dec(document.getElementById('promo-fixed').value);
  if (!name || (!pct && !fixed)) { alert('Podaj nazwę i rabat procentowy lub stały'); return; }
  const promo = {
    id: uuid(),
    name,
    percentOff: pct || null,
    fixedOff: fixed || null,
    productIds: null,
    couponCode: null,
    active: true,
    expiresAt: null,
    minQty: null,
    minTotal: null
  };
  state.promotions.push(promo);
  document.getElementById('promo-name').value = '';
  document.getElementById('promo-pct').value = '';
  document.getElementById('promo-fixed').value = '';
  saveAll();
});

function renderPromotions() {
  const ul = document.getElementById('promos-list');
  ul.innerHTML = '';
  state.promotions.forEach(p => {
    const li = document.createElement('li');
    li.innerHTML = `<span><strong>${p.name}</strong><br/><span class="muted">Procent: ${p.percentOff || 0}% • Stały: ${p.fixedOff ? fmt(p.fixedOff) : '-'}</span></span>`;
    const btn = document.createElement('button');
    btn.textContent = p.active ? 'Wyłącz' : 'Włącz';
    btn.addEventListener('click', () => { p.active = !p.active; saveAll(); });
    li.appendChild(btn);
    ul.appendChild(li);
  });
}

// ====== TRANSAKCJE ======
function renderTransactions() {
  const ul = document.getElementById('transactions-list');
  ul.innerHTML = '';
  state.transactions.forEach(t => {
    const splits = t.splits.map(s => `${s.method}:${fmt(s.amount)}`).join(', ');
    const li = document.createElement('li');
    li.innerHTML = `<span><strong>${t.id.slice(0,6)}</strong> — ${new Date(t.date).toLocaleString()}<br/>Total: ${fmt(t.total)} zł • Splits: ${splits}${t.shiftId ? ' • Zmiana: ' + t.shiftId.slice(0,6) : ''}</span>`;
    ul.appendChild(li);
  });
}

// ====== ZMIANY KASOWE / RAPORT ======
document.getElementById('shift-open').addEventListener('click', () => {
  if (currentOpenShift()) { alert('Zmiana już otwarta'); return; }
  const opening = dec(document.getElementById('shift-open-cash').value);
  const shift = {
    id: uuid(),
    openedAt: new Date().toISOString(),
    openedBy: state.profile.name || 'Kasjer',
    openingCash: opening,
    closedAt: null,
    closingCash: null,
    cashSalesTotal: 0,
    cardSalesTotal: 0,
    otherSalesTotal: 0,
    notes: '',
    state: 'open',
    discrepancy: null
  };
  state.shifts.unshift(shift);
  document.getElementById('shift-open-cash').value = '';
  saveAll();
});

document.getElementById('shift-close').addEventListener('click', () => {
  const open = currentOpenShift();
  if (!open) { alert('Brak otwartej zmiany'); return; }
  const closingCash = dec(document.getElementById('shift-close-cash').value);
  const notes = document.getElementById('shift-notes').value.trim();
  const totals = totalsForShift(open.openedAt, new Date());

  open.closedAt = new Date().toISOString();
  open.closingCash = closingCash;
  open.cashSalesTotal = totals.cash;
  open.cardSalesTotal = totals.card;
  open.otherSalesTotal = totals.other;
  const expectedCash = (open.openingCash || 0) + totals.cash;
  open.discrepancy = closingCash - expectedCash;
  open.notes = notes;
  open.state = 'closed';

  document.getElementById('shift-close-cash').value = '';
  document.getElementById('shift-notes').value = '';
  saveAll();
  alert(`Zamknięto zmianę. Różnica: ${fmt(open.discrepancy)} zł`);
});

function totalsForShift(openedAtISO, closedDate) {
  const openedAt = new Date(openedAtISO);
  const end = closedDate || new Date();
  const relevant = state.transactions.filter(t => new Date(t.date) >= openedAt && new Date(t.date) <= end);
  let cash = 0, card = 0, other = 0;
  relevant.forEach(t => t.splits.forEach(s => {
    if (s.method === 'cash') cash += s.amount;
    else if (s.method === 'card') card += s.amount;
    else other += s.amount;
  }));
  return { cash, card, other };
}

function renderShifts() {
  const currentEl = document.getElementById('shift-current');
  const ul = document.getElementById('shifts-list');
  currentEl.innerHTML = '';
  ul.innerHTML = '';

  const open = currentOpenShift();
  if (open) {
    const totals = totalsForShift(open.openedAt, null);
    currentEl.innerHTML = `
      <p><strong>Otwarte:</strong> ${new Date(open.openedAt).toLocaleString()}</p>
      <p><strong>Gotówka początkowa:</strong> ${fmt(open.openingCash)} zł</p>
      <p><strong>Suma sprzedaży:</strong><br/>Gotówka: ${fmt(totals.cash)} zł • Karta: ${fmt(totals.card)} zł • Inne: ${fmt(totals.other)} zł</p>
    `;
  } else {
    currentEl.innerHTML = `<p>Brak otwartej zmiany</p>`;
  }

  state.shifts.sort((a,b)=>new Date(b.openedAt)-new Date(a.openedAt)).forEach(s => {
    const li = document.createElement('li');
    const isOpen = s.state === 'open';
    li.innerHTML = `
      <span>
        <strong>${isOpen ? 'OTWARTA' : 'ZAMKNIĘTA'}</strong> • ${new Date(s.openedAt).toLocaleString()}
        ${!isOpen ? `<br/>Otwarcie: ${fmt(s.openingCash)} zł • Zamknięcie: ${fmt(s.closingCash || 0)} zł • Gotówka sprz.: ${fmt(s.cashSalesTotal)} zł • Karta: ${fmt(s.cardSalesTotal)} zł ${s.discrepancy!=null ? ' • Różnica: ' + fmt(s.discrepancy) + ' zł' : ''}` : ''}
      </span>
    `;
    ul.appendChild(li);
  });
}

// ====== ZWROTY ======
function renderRefundsPanel() {
  const panel = document.getElementById('refund-panel');
  panel.innerHTML = '';

  // Wybór transakcji
  const selectTx = document.createElement('select');
  const none = document.createElement('option'); none.value = ''; none.textContent = 'Wybierz transakcję';
  selectTx.appendChild(none);
  state.transactions.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t.id;
    opt.textContent = `${t.id.slice(0,6)} • ${fmt(t.total)} zł`;
    selectTx.appendChild(opt);
  });

  const itemsList = document.createElement('div');
  const qtyInput = document.createElement('input'); qtyInput.type = 'text'; qtyInput.placeholder = 'Ilość do zwrotu';
  const reasonInput = document.createElement('input'); reasonInput.type = 'text'; reasonInput.placeholder = 'Powód (opcjonalnie)';
  const btn = document.createElement('button'); btn.textContent = 'Zatwierdź zwrot'; btn.classList.add('primary');

  let selectedItemId = null;
  selectTx.addEventListener('change', () => {
    itemsList.innerHTML = '';
    selectedItemId = null;
    const tx = state.transactions.find(t => t.id === selectTx.value);
    if (!tx) return;
    tx.items.forEach(it => {
      const row = document.createElement('div');
      const choose = document.createElement('button'); choose.textContent = 'Wybierz';
      choose.addEventListener('click', () => { selectedItemId = it.id; alert(`Wybrano: ${it.name}`); });
      row.className = 'refund-row';
      row.innerHTML = `<span>${it.name} • x${it.qty} • ${fmt(it.price - (it.discount || 0))} zł</span>`;
      row.appendChild(choose);
      itemsList.appendChild(row);
    });
  });

  btn.addEventListener('click', () => {
    const tx = state.transactions.find(t => t.id === selectTx.value);
    if (!tx) { alert('Wybierz transakcję'); return; }
    const item = tx.items.find(it => it.id === selectedItemId);
    if (!item) { alert('Wybierz pozycję do zwrotu'); return; }
    const qty = parseInt(qtyInput.value || '1', 10);
    if (!qty || qty <= 0 || qty > item.qty) { alert('Nieprawidłowa ilość'); return; }

    const refundAmount = (item.price - (item.discount || 0)) * qty;
    const refund = {
      id: uuid(),
      date: new Date().toISOString(),
      originalTransactionId: tx.id,
      productId: item.productId,
      qty,
      amount: refundAmount,
      reason: reasonInput.value.trim() || null,
      processedBy: state.profile.name || 'Kasjer'
    };
    state.refunds.unshift(refund);

    // Zwiększ stock
    const pIdx = state.products.findIndex(p => p.id === item.productId);
    if (pIdx >= 0) {
      state.products[pIdx].stock += qty;
      state.inventoryOps.push({ id: uuid(), date: new Date().toISOString(), productId: item.productId, qtyChange: qty, type: 'adjustment', note: `Zwrot ${refund.id.slice(0,6)}` });
    }

    // Transakcja ujemna
    const negativeItem = { id: uuid(), productId: item.productId, name: 'Zwrot: ' + item.name, qty, price: -item.price, discount: 0, isService: item.isService };
    const refundTx = {
      id: uuid(),
      date: new Date().toISOString(),
      items: [negativeItem],
      customerId: tx.customerId || null,
      splits: [{ method: 'cash', amount: -refundAmount }],
      total: -refundAmount,
      notes: `Refund ${refund.id}`,
      shiftId: currentOpenShift()?.id || null
    };
    state.transactions.unshift(refundTx);
    qtyInput.value = '';
    reasonInput.value = '';
    saveAll();
    alert('Zwrot zapisany');
  });

  panel.append(
    document.createTextNode('Transakcja: '), selectTx,
    document.createElement('br'),
    document.createTextNode('Pozycje:'), itemsList,
    document.createElement('br'),
    qtyInput, reasonInput, btn
  );
}

// ====== PROFIL ======
document.getElementById('profile-save').addEventListener('click', () => {
  state.profile.name = document.getElementById('profile-name').value || 'Kasjer';
  state.profile.email = document.getElementById('profile-email').value || '';
  state.profile.businessName = document.getElementById('profile-business').value || '';
  saveAll();
  alert('Profil zapisany');
});

function renderProfile() {
  document.getElementById('profile-name').value = state.profile.name || '';
  document.getElementById('profile-email').value = state.profile.email || '';
  document.getElementById('profile-business').value = state.profile.businessName || '';
}

// ====== Render „wszystko” ======
function renderAll() {
  renderCategories();
  renderProducts();
  renderCart();
  renderInventory();
  renderOrders();
  renderPromotions();
  renderTransactions();
  renderShifts();
  renderRefundsPanel();
  renderProfile();
}

// Start
renderAll();
