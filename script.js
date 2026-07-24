const API_URL = 'https://script.google.com/macros/s/AKfycbwg_t7RJw7yuMdr-V023oPVMQA8eYh0ah4WNbduENeeqiRFic7kUiErjjBG9Qd3h292/exec';

let currentClient = null;
let goals = [];

const defaults = {
  retirement: { inflation: 6, return: 10 },
  education: { inflation: 9, return: 9 },
  house: { inflation: 6, return: 8 },
  car: { inflation: 5, return: 7 },
  vacation: { inflation: 5, return: 6 },
  emergency: { inflation: 0, return: 5.5 },
  custom: { inflation: 6, return: 8 }
};

// DOM refs
const tabs = document.querySelectorAll('.tab');
const panels = document.querySelectorAll('.tab-panel');
const plannerDiv = document.getElementById('planner');
const currentClientNameEl = document.getElementById('current-client-name');
const searchInput = document.getElementById('search-client');
const loadClientBtn = document.getElementById('load-client-btn');
const clientList = document.getElementById('client-list');
const newClientName = document.getElementById('new-client-name');
const createClientBtn = document.getElementById('create-client-btn');
const howToBtn = document.getElementById('how-to-btn');
const howToPanel = document.getElementById('how-to-panel');
const closeGuide = document.getElementById('close-guide');

let goalType, goalName, currentCost, yearsToGoal, inflationRate, expectedReturn, existingSavings,
    addGoalBtn, cancelEditBtn, editingId, formHeading, goalCardsContainer, summaryTableBody,
    insightsList, printBtn;

function init() {
  // Tab switching
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelector('.tab.active').classList.remove('active');
      document.querySelector('.tab-panel.active').classList.remove('active');
      tab.classList.add('active');
      const panel = document.getElementById(`${tab.dataset.tab}-panel`);
      panel.classList.add('active');
      if (tab.dataset.tab === 'existing') fetchAllClients();
    });
  });

  // How-to toggle
  howToBtn.addEventListener('click', () => {
    howToPanel.style.display = howToPanel.style.display === 'none' ? 'block' : 'none';
  });
  closeGuide.addEventListener('click', () => {
    howToPanel.style.display = 'none';
  });

  loadClientBtn.addEventListener('click', loadClient);
  createClientBtn.addEventListener('click', createNewClient);
  searchInput.addEventListener('input', debounce(fetchFilteredClients, 300));

  // Grab planner elements (they're always in DOM)
  goalType = document.getElementById('goal-type');
  goalName = document.getElementById('goal-name');
  currentCost = document.getElementById('current-cost');
  yearsToGoal = document.getElementById('years-to-goal');
  inflationRate = document.getElementById('inflation-rate');
  expectedReturn = document.getElementById('expected-return');
  existingSavings = document.getElementById('existing-savings');
  addGoalBtn = document.getElementById('add-goal-btn');
  cancelEditBtn = document.getElementById('cancel-edit-btn');
  editingId = document.getElementById('editing-id');
  formHeading = document.getElementById('form-heading');
  goalCardsContainer = document.getElementById('goal-cards-container');
  summaryTableBody = document.querySelector('#summary-table tbody');
  insightsList = document.getElementById('insights-list');
  printBtn = document.getElementById('print-btn');

  goalType.addEventListener('change', onGoalTypeChange);
  addGoalBtn.addEventListener('click', addOrUpdateGoal);
  cancelEditBtn.addEventListener('click', cancelEdit);

  fetchAllClients();
}

// ---------- Client list ----------
async function fetchAllClients() {
  try {
    const res = await fetch(`${API_URL}?action=listClients`);
    const clients = await res.json();
    if (Array.isArray(clients)) {
      clientList.innerHTML = clients.map(c => `<div onclick="selectClientSuggestion('${c}')">${c}</div>`).join('');
    }
  } catch (e) { console.error(e); }
}

async function fetchFilteredClients() {
  const query = searchInput.value.trim();
  if (!query) { fetchAllClients(); return; }
  try {
    const res = await fetch(`${API_URL}?action=listClients`);
    const clients = await res.json();
    const filtered = clients.filter(c => c.toLowerCase().includes(query.toLowerCase()));
    clientList.innerHTML = filtered.map(c => `<div onclick="selectClientSuggestion('${c}')">${c}</div>`).join('');
  } catch (e) { console.error(e); }
}

function selectClientSuggestion(name) {
  searchInput.value = name;
  clientList.innerHTML = '';
  loadClient();
}

// ---------- Client loading ----------
async function loadClient() {
  const name = searchInput.value.trim();
  if (!name) return alert('Enter a client name');
  currentClient = name;
  currentClientNameEl.textContent = `Client: ${name}`;
  plannerDiv.style.display = 'block';
  await loadGoalsAndRender();
}

async function createNewClient() {
  const name = newClientName.value.trim();
  if (!name) return alert('Enter a name');
  currentClient = name;
  currentClientNameEl.textContent = `Client: ${name}`;
  plannerDiv.style.display = 'block';
  newClientName.value = '';
  goals = [];
  renderAll();
  fetchAllClients();
}

async function loadGoalsAndRender() {
  if (!currentClient) return;
  try {
    const [goalsData, contribsData] = await Promise.all([
      fetch(`${API_URL}?action=getClientGoals&client=${encodeURIComponent(currentClient)}`).then(r => r.json()),
      fetch(`${API_URL}?action=getClientContributions&client=${encodeURIComponent(currentClient)}`).then(r => r.json())
    ]);
    goals = goalsData.map(g => ({
      id: g.goalId,
      type: g.type,
      name: g.name,
      currentCost: g.currentCost,
      yearsToGoal: g.years,
      inflationRate: g.inflation / 100,
      expectedReturn: g.return / 100,
      existingSavings: g.existing,
      contributions: contribsData.filter(c => c.goalId === g.goalId).map(c => ({ date: c.date, amount: c.amount }))
    }));
  } catch (e) { console.error(e); goals = []; }
  renderAll();
}

// ---------- Calculation (unchanged) ----------
function computeGoal(goal) {
  const futureCost = goal.currentCost * Math.pow(1 + goal.inflationRate, goal.yearsToGoal);
  const fvExisting = goal.existingSavings * Math.pow(1 + goal.expectedReturn, goal.yearsToGoal);
  let fvContributions = 0;
  if (goal.contributions) {
    goal.contributions.forEach(cont => {
      const yearsElapsed = (new Date() - new Date(cont.date)) / (365.25*24*60*60*1000);
      const yearsRemaining = goal.yearsToGoal - yearsElapsed;
      if (yearsRemaining > 0) fvContributions += cont.amount * Math.pow(1 + goal.expectedReturn, yearsRemaining);
      else fvContributions += cont.amount;
    });
  }
  const totalFV = fvExisting + fvContributions;
  const shortfall = futureCost - totalFV;
  let requiredSIP = 0;
  if (shortfall > 0.01) {
    const r = goal.expectedReturn / 12;
    const n = goal.yearsToGoal * 12;
    if (r === 0) requiredSIP = shortfall / n;
    else requiredSIP = shortfall * r / (Math.pow(1 + r, n) - 1);
  }
  return { futureCost, fvExisting, fvContributions, totalFV, shortfall, requiredSIP, status: shortfall <= 0 ? 'Funded' : 'Shortfall' };
}

function computePlan() {
  let totalFutureCost = 0, totalFv = 0, totalShortfall = 0, totalMonthly = 0;
  const computedGoals = goals.map(g => {
    const c = computeGoal(g);
    totalFutureCost += c.futureCost;
    totalFv += c.totalFV;
    totalShortfall += Math.max(0, c.shortfall);
    totalMonthly += c.requiredSIP;
    return { ...g, ...c };
  });
  const readinessRatio = totalFutureCost > 0 ? totalFv / totalFutureCost : 0;
  let readinessScore = 'D';
  if (readinessRatio > 0.9) readinessScore = 'A';
  else if (readinessRatio > 0.7) readinessScore = 'B';
  else if (readinessRatio > 0.5) readinessScore = 'C';
  return { goals: computedGoals, totals: { totalFutureCost, totalFv, totalShortfall, totalMonthly, readinessScore } };
}

function generateInsights(goals, totals) {
  if (goals.length === 0) return ['Add your first goal to see personalized insights.'];
  const insights = [];
  const maxSIPGoal = goals.reduce((max, g) => g.requiredSIP > max.requiredSIP ? g : max);
  insights.push(`${maxSIPGoal.name} requires your largest monthly commitment (₹${Math.round(maxSIPGoal.requiredSIP).toLocaleString()}).`);
  const funded = goals.filter(g => g.shortfall <= 0);
  if (funded.length) insights.push(`${funded.map(g => g.name).join(', ')} ${funded.length === 1 ? 'is' : 'are'} already fully funded.`);
  const minTime = goals.reduce((min, g) => g.yearsToGoal < min.yearsToGoal ? g : min);
  if (minTime.yearsToGoal <= 5) insights.push(`${minTime.name} has a short time horizon (${minTime.yearsToGoal} years) — prioritize funding it.`);
  if (totals.readinessScore === 'C' || totals.readinessScore === 'D') {
    insights.push(`Your overall readiness score is ${totals.readinessScore}. Consider increasing monthly investments or extending timelines.`);
  }
  return insights;
}

// ---------- Rendering ----------
let chartInstances = {};

// Common dark-theme chart options
const darkChartOptions = {
  responsive: true,
  plugins: {
    legend: {
      position: 'bottom',
      labels: { color: '#F8FAFC' }
    }
  },
  scales: {
    x: {
      ticks: { color: '#94A3B8' },
      grid: { color: 'rgba(148,163,184,0.1)' }
    },
    y: {
      beginAtZero: true,
      ticks: { color: '#94A3B8' },
      grid: { color: 'rgba(148,163,184,0.1)' }
    }
  }
};

function renderAll() {
  if (!currentClient) return;
  const plan = computePlan();
  renderCards(plan.goals);
  renderTable(plan.goals);
  renderKPIs(plan);
  renderCharts(plan.goals);
  renderInsights(plan);
}

function renderCards(goals) {
  goalCardsContainer.innerHTML = goals.map(g => {
    const computed = computeGoal(g);
    const contributions = g.contributions || [];
    const history = contributions.map(c => `<li>${new Date(c.date).toLocaleDateString()} – ₹${c.amount.toLocaleString()}</li>`).join('');
    return `
    <div class="goal-card ${computed.shortfall <= 0 ? 'funded' : (computed.shortfall / computed.futureCost > 0.3 ? 'shortfall' : 'partial')}">
      <button class="remove-btn" onclick="removeGoal('${g.id}')">✕</button>
      <button class="edit-btn" onclick="editGoal('${g.id}')">✎</button>
      <h3>${g.name}</h3>
      <div class="details">
        <p>Type: ${g.type}</p>
        <p>Current Cost: ₹${g.currentCost.toLocaleString()}</p>
        <p>Years to goal: ${g.yearsToGoal}</p>
        <p>Future Cost: ₹${Math.round(computed.futureCost).toLocaleString()}</p>
        <p>FV of Savings + Contributions: ₹${Math.round(computed.totalFV).toLocaleString()}</p>
        <p>Shortfall: ₹${Math.round(Math.max(0, computed.shortfall)).toLocaleString()} ${computed.shortfall <= 0 ? '(Surplus)' : ''}</p>
        <p><strong>Required SIP: ₹${Math.round(computed.requiredSIP).toLocaleString()}/month</strong></p>
      </div>
      <div class="contribution-area">
        <strong>Contributions (${contributions.length}):</strong>
        <div class="contribution-form">
          <input type="number" id="contrib-amount-${g.id}" placeholder="Amount (₹)">
          <button onclick="addContribution('${g.id}')" class="btn-primary" style="padding:8px 12px;">Add Payment</button>
        </div>
        <ul class="contribution-history">${history}</ul>
      </div>
    </div>`;
  }).join('');
}

function renderTable(goals) {
  summaryTableBody.innerHTML = goals.map(g => {
    const c = computeGoal(g);
    return `
    <tr>
      <td>${g.name}</td>
      <td>₹${Math.round(c.futureCost).toLocaleString()}</td>
      <td>₹${Math.round(c.totalFV).toLocaleString()}</td>
      <td style="color:${c.shortfall>0?'var(--danger)':'var(--success)'}">₹${Math.round(Math.abs(c.shortfall)).toLocaleString()} ${c.shortfall<=0?'(Surplus)':''}</td>
      <td>₹${Math.round(c.requiredSIP).toLocaleString()}</td>
      <td><span class="status-badge">${c.shortfall<=0?'Funded':'Shortfall'}</span></td>
    </tr>`;
  }).join('');
}

function renderKPIs(plan) {
  document.getElementById('kpi-goals').textContent = plan.goals.length;
  document.getElementById('kpi-future-cost').textContent = '₹' + Math.round(plan.totals.totalFutureCost).toLocaleString();
  document.getElementById('kpi-monthly-sip').textContent = '₹' + Math.round(plan.totals.totalMonthly).toLocaleString();
  document.getElementById('kpi-shortfall').textContent = '₹' + Math.round(plan.totals.totalShortfall).toLocaleString();
  const score = plan.totals.readinessScore;
  const el = document.getElementById('kpi-readiness');
  el.textContent = score;
  el.style.color = score === 'A' || score === 'B' ? 'var(--success)' : 'var(--danger)';
}

function renderCharts(goals) {
  if (chartInstances.donut) chartInstances.donut.destroy();
  if (chartInstances.stackedBar) chartInstances.stackedBar.destroy();

  // Donut chart
  const donutCtx = document.getElementById('donut-chart').getContext('2d');
  chartInstances.donut = new Chart(donutCtx, {
    type: 'doughnut',
    data: {
      labels: goals.map(g => g.name),
      datasets: [{
        data: goals.map(g => Math.round(g.requiredSIP)),
        backgroundColor: ['#3B82F6','#10B981','#F59E0B','#DC2626','#8B5CF6','#EC4899','#14B8A6','#6366F1','#F97316']
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color: '#F8FAFC' }
        }
      }
    }
  });

  // Stacked bar chart
  const barCtx = document.getElementById('stacked-bar-chart').getContext('2d');
  chartInstances.stackedBar = new Chart(barCtx, {
    type: 'bar',
    data: {
      labels: goals.map(g => g.name),
      datasets: [
        {
          label: 'FV of Savings & Contributions',
          data: goals.map(g => Math.round(g.totalFV)),
          backgroundColor: '#10B981'
        },
        {
          label: 'Gap to Fund',
          data: goals.map(g => Math.max(0, Math.round(g.shortfall))),
          backgroundColor: '#DC2626'
        }
      ]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { labels: { color: '#F8FAFC' } }
      },
      scales: {
        x: {
          stacked: true,
          ticks: { color: '#94A3B8' },
          grid: { color: 'rgba(148,163,184,0.1)' }
        },
        y: {
          stacked: true,
          beginAtZero: true,
          ticks: { color: '#94A3B8' },
          grid: { color: 'rgba(148,163,184,0.1)' }
        }
      }
    }
  });
}

function renderInsights(plan) {
  const insights = generateInsights(plan.goals, plan.totals);
  insightsList.innerHTML = insights.map(i => `<li>${i}</li>`).join('');
}

// ---------- CRUD with API ----------
async function saveGoalToSheet(goal) {
  const params = new URLSearchParams({
    action: 'saveGoal', client: currentClient, goalId: goal.id, type: goal.type,
    name: goal.name, currentCost: goal.currentCost, years: goal.yearsToGoal,
    inflation: goal.inflationRate*100, ret: goal.expectedReturn*100, existing: goal.existingSavings
  });
  try {
    const res = await fetch(`${API_URL}?${params.toString()}`);
    const data = await res.json();
    if (data.status !== 'ok') throw new Error('Save failed');
    fetchAllClients();
  } catch (e) { console.error(e); alert('Could not save goal. Check console.'); }
}

async function deleteGoalFromSheet(goalId) {
  try {
    await fetch(`${API_URL}?action=deleteGoal&client=${encodeURIComponent(currentClient)}&goalId=${goalId}`);
    fetchAllClients();
  } catch (e) { console.error(e); }
}

async function addContributionToSheet(goalId, date, amount) {
  const params = new URLSearchParams({ action: 'addContribution', client: currentClient, goalId, date, amount });
  try {
    await fetch(`${API_URL}?${params.toString()}`);
  } catch (e) { console.error(e); }
}

// ---------- UI Handlers ----------
function onGoalTypeChange() {
  const type = goalType.value;
  if (!type) return;
  const def = getDefault(type);
  inflationRate.value = def.inflation;
  expectedReturn.value = def.return;
  if (!goalName.value) goalName.value = type.charAt(0).toUpperCase() + type.slice(1);
}
function getDefault(type) {
  const infEl = document.getElementById(`default-inflation-${type}`);
  const retEl = document.getElementById(`default-return-${type}`);
  return {
    inflation: infEl ? parseFloat(infEl.value) : defaults[type].inflation,
    return: retEl ? parseFloat(retEl.value) : defaults[type].return
  };
}

async function addOrUpdateGoal() {
  const type = goalType.value;
  if (!type) return alert('Select a goal type');
  const name = goalName.value.trim() || type;
  const cost = parseFloat(currentCost.value);
  const years = parseInt(yearsToGoal.value);
  const inflation = parseFloat(inflationRate.value) / 100;
  const ret = parseFloat(expectedReturn.value) / 100;
  const savings = parseFloat(existingSavings.value) || 0;
  if (isNaN(cost) || isNaN(years) || isNaN(inflation) || isNaN(ret) || years < 1) return alert('Fill all fields correctly');

  if (editingId.value) {
    const idx = goals.findIndex(g => g.id === editingId.value);
    if (idx !== -1) {
      goals[idx] = { ...goals[idx], type, name, currentCost: cost, yearsToGoal: years, inflationRate: inflation, expectedReturn: ret, existingSavings: savings };
      await saveGoalToSheet(goals[idx]);
    }
    cancelEdit();
  } else {
    const goal = { id: Date.now().toString(), type, name, currentCost: cost, yearsToGoal: years, inflationRate: inflation, expectedReturn: ret, existingSavings: savings, contributions: [] };
    goals.push(goal);
    await saveGoalToSheet(goal);
  }
  clearForm();
  renderAll();
}

function editGoal(id) {
  const goal = goals.find(g => g.id === id);
  if (!goal) return;
  goalType.value = goal.type;
  goalName.value = goal.name;
  currentCost.value = goal.currentCost;
  yearsToGoal.value = goal.yearsToGoal;
  inflationRate.value = goal.inflationRate * 100;
  expectedReturn.value = goal.expectedReturn * 100;
  existingSavings.value = goal.existingSavings;
  editingId.value = id;
  formHeading.innerHTML = '<i class="fas fa-edit"></i> Edit Goal';
  addGoalBtn.innerHTML = '<i class="fas fa-save"></i> Update Goal';
  cancelEditBtn.style.display = 'inline-flex';
  window.scrollTo({ top: document.querySelector('.add-goal-section').offsetTop - 100, behavior: 'smooth' });
}

function cancelEdit() {
  clearForm();
  editingId.value = '';
  formHeading.innerHTML = '<i class="fas fa-plus-circle"></i> Add a New Goal';
  addGoalBtn.innerHTML = '<i class="fas fa-plus"></i> Add Goal';
  cancelEditBtn.style.display = 'none';
}

async function removeGoal(id) {
  if (!confirm('Delete this goal?')) return;
  goals = goals.filter(g => g.id !== id);
  await deleteGoalFromSheet(id);
  renderAll();
}

function clearForm() {
  goalType.value = '';
  goalName.value = '';
  currentCost.value = '';
  yearsToGoal.value = '';
  inflationRate.value = '';
  expectedReturn.value = '';
  existingSavings.value = '';
}

async function addContribution(id) {
  const amount = parseFloat(document.getElementById(`contrib-amount-${id}`)?.value);
  if (!amount || amount <= 0) return alert('Enter valid amount');
  const goal = goals.find(g => g.id === id);
  if (!goal) return;
  const now = new Date().toISOString();
  goal.contributions.push({ date: now, amount });
  await addContributionToSheet(id, now, amount);
  document.getElementById(`contrib-amount-${id}`).value = '';
  renderAll();
}

function debounce(fn, delay) {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), delay); };
}

init();