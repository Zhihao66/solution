// Clean single-file implementation for calculator + DB + tabs
// All DOM access & bindings happen inside DOMContentLoaded
function $(id){ return document.getElementById(id) }

const defaultSoluteDB = {
  'NaCl': { mw: 58.44, solubility_g_per_L: 359 },
  'KCl': { mw: 74.55, solubility_g_per_L: 344 },
  'Glucose': { mw: 180.16, solubility_g_per_L: 909 },
  'NaOH': { mw: 40.00, solubility_g_per_L: 1110 },
  'Tris': { mw: 121.14, solubility_g_per_L: 100 },
  'CaCl2': { mw: 110.98, solubility_g_per_L: 745 }
}

let soluteDB = {}
const DB_LS_KEY = 'solution_calculator_soluteDB_v1'
const HYDRATE_MW = 18.01528
let manualMw = false
let lastSelectedSolute = null
let editingEntry = null

// === Utility functions ===
function toLiters(value, unit){ if (isNaN(value)) return NaN; return unit === 'mL' ? value/1000 : value }
function concToMolPerL(concVal, concUnit, mw){
  if (isNaN(concVal)) return NaN
  switch(concUnit){
    case 'M': return concVal
    case 'mM': return concVal / 1000
    case 'μM': return concVal / 1000000
    case 'g/L': return isNaN(mw)? NaN : concVal / mw
    case 'mg/L': return isNaN(mw)? NaN : (concVal / 1000) / mw
    case 'μg/L': return isNaN(mw)? NaN : (concVal / 1000000) / mw
    case '%': return isNaN(mw)? NaN : (concVal * 10) / mw
    case 'ppm': return isNaN(mw)? NaN : ((concVal/1000) / mw)
    case 'ppb': return isNaN(mw)? NaN : ((concVal/1000000) / mw)
    default: return NaN
  }
}
function formatNumber(v){ if (!isFinite(v)) return String(v); return Number(v).toPrecision(6).replace(/(?:\.0+|(?<=\.[0-9]*?)0+)$/,'') }
function showMessage(msg){ const el = $('message'); if (el) el.textContent = msg }

// === Database persistence ===
function loadDBFromStorage(){
  try{ const raw = localStorage.getItem(DB_LS_KEY); if (raw){ soluteDB = JSON.parse(raw); return } }catch(e){ console.warn('loadDB error', e) }
  soluteDB = Object.assign({}, defaultSoluteDB)
  saveDBToStorage(soluteDB)
}
function saveDBToStorage(db){ try{ localStorage.setItem(DB_LS_KEY, JSON.stringify(db)); soluteDB = db; return true }catch(e){ console.warn('saveDB error', e); return false } }
function exportDbToFile(){ const data = JSON.stringify(soluteDB, null, 2); const blob = new Blob([data], {type:'application/json'}); const url = URL.createObjectURL(blob); const a=document.createElement('a'); a.href = url; a.download = 'solute_db.json'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url) }

// === DB rendering & operations ===
function updateSoluteDatalist(){
  const datalist = $('soluteList')
  if (!datalist) return
  datalist.innerHTML = ''
  Object.keys(soluteDB).sort().forEach(name=>{
    const option = document.createElement('option')
    option.value = name
    datalist.appendChild(option)
  })
}

function renderDbTable(){
  const tbody = $('dbTable').querySelector('tbody')
  tbody.innerHTML = ''
  Object.keys(soluteDB).sort().forEach(name=>{
    const e = soluteDB[name] || {}
    const tr = document.createElement('tr')
    tr.innerHTML = `
      <td style="padding:6px;border-top:1px solid #e6eef6">${name}</td>
      <td style="padding:6px;border-top:1px solid #e6eef6">${e.mw ?? ''}</td>
      <td style="padding:6px;border-top:1px solid #e6eef6">${e.solubility_g_per_L ?? ''}</td>
      <td style="padding:6px;border-top:1px solid #e6eef6">${e.hydrate_default ?? ''}</td>
      <td style="padding:6px;border-top:1px solid #e6eef6"><button data-name="${name}" class="editDbBtn">编辑</button><button data-name="${name}" class="delDbBtn" style="margin-left:6px">删除</button></td>`
    tbody.appendChild(tr)
  })
  tbody.querySelectorAll('.delDbBtn').forEach(btn=> btn.addEventListener('click', ()=>{
    const n = btn.getAttribute('data-name'); if (confirm(`删除条目 ${n} ?`)){ delete soluteDB[n]; saveDBToStorage(soluteDB); renderDbTable(); updateSoluteDatalist(); $('dbMsg').textContent='已删除' }
  }))
  tbody.querySelectorAll('.editDbBtn').forEach(btn=> btn.addEventListener('click', ()=>{
    const n = btn.getAttribute('data-name'); startEditEntry(n)
  }))
  updateSoluteDatalist()
}

function importDbFromText(text){
  const lines = text.split(/\r?\n/).map(l=>l.trim()).filter(l=>l && !l.startsWith('#'))
  const added = []
  lines.forEach(line=>{
    const sep = line.includes('\t') ? '\t' : ','
    const parts = line.split(sep).map(p=>p.trim())
    if (parts.length >= 2){
      const name = parts[0]
      const mw = parseFloat(parts[1])
      const sol = parts[2] ? parseFloat(parts[2]) : undefined
      const hyd = parts[3] ? parseInt(parts[3],10) : undefined
      soluteDB[name] = Object.assign({}, soluteDB[name] || {}, {mw: isNaN(mw)? undefined: mw})
      if (!isNaN(sol)) soluteDB[name].solubility_g_per_L = sol
      if (!isNaN(hyd)) soluteDB[name].hydrate_default = hyd
      added.push(name)
    }
  })
  saveDBToStorage(soluteDB)
  renderDbTable()
  return added
}

function startEditEntry(name){
  const entry = soluteDB[name]; if (!entry) return
  editingEntry = name
  $('dbName').value = name; $('dbMw').value = entry.mw ?? ''; $('dbSolubility').value = entry.solubility_g_per_L ?? ''; $('dbHydrate').value = entry.hydrate_default ?? ''
  $('addEntryBtn').textContent = '保存'
  showTab('dbTab')
}

function addDbEntryFromInputs(){
  const name = $('dbName').value.trim(); if (!name){ $('dbMsg').textContent='名称不能为空'; return }
  const mwStr = $('dbMw').value.trim(); const solStr = $('dbSolubility').value.trim(); const hydStr = $('dbHydrate').value.trim()
  const mw = mwStr ? parseFloat(mwStr) : NaN
  const sol = solStr ? parseFloat(solStr) : NaN
  const hyd = hydStr ? parseInt(hydStr,10) : NaN
  soluteDB[name] = soluteDB[name] || {}
  if (!isNaN(mw)) soluteDB[name].mw = mw; else delete soluteDB[name].mw
  if (!isNaN(sol)) soluteDB[name].solubility_g_per_L = sol; else delete soluteDB[name].solubility_g_per_L
  if (!isNaN(hyd)) soluteDB[name].hydrate_default = hyd; else delete soluteDB[name].hydrate_default
  let msg = `已添加/更新 ${name}`
  if (isNaN(mw)) msg += ' (⚠️ 缺少摩尔质量)'
  if (isNaN(sol)) msg += ' (⚠️ 缺少溶解度，计算时无法验证)'
  saveDBToStorage(soluteDB); renderDbTable(); updateSoluteDatalist(); $('dbMsg').textContent = msg; ['dbName','dbMw','dbSolubility','dbHydrate'].forEach(id=>$(id).value='')
}

function finishEditOrAdd(){
  const name = $('dbName').value.trim(); if (!name){ $('dbMsg').textContent='名称不能为空'; return }
  const mwStr = $('dbMw').value.trim(); const solStr = $('dbSolubility').value.trim(); const hydStr = $('dbHydrate').value.trim()
  const mw = mwStr ? parseFloat(mwStr) : NaN
  const sol = solStr ? parseFloat(solStr) : NaN
  const hyd = hydStr ? parseInt(hydStr,10) : NaN
  if (editingEntry && editingEntry !== name){ delete soluteDB[editingEntry] }
  soluteDB[name] = soluteDB[name] || {}
  if (!isNaN(mw)) soluteDB[name].mw = mw; else delete soluteDB[name].mw
  if (!isNaN(sol)) soluteDB[name].solubility_g_per_L = sol; else delete soluteDB[name].solubility_g_per_L
  if (!isNaN(hyd)) soluteDB[name].hydrate_default = hyd; else delete soluteDB[name].hydrate_default
  let msg = editingEntry ? `已更新 ${name}` : `已添加 ${name}`
  if (isNaN(sol)) msg += ' (⚠️ 缺少溶解度)'
  saveDBToStorage(soluteDB); renderDbTable(); updateSoluteDatalist(); $('dbMsg').textContent = msg
  editingEntry = null; $('addEntryBtn').textContent = '添加'; ['dbName','dbMw','dbSolubility','dbHydrate'].forEach(id=>$(id).value='')
}

// === Calculator related ===
function generateStepsGuide(solute, mw, mass_g, concVal, concUnit, volVal, volUnit, volL, hydrate, mode, stockVol_mL){
  const steps = []
  const volDisplay = volVal + (volUnit || 'L')
  const isDilute = mode === 'dilute'
  
  // 仪器部分
  steps.push('【所需仪器】')
  if (isDilute) {
    steps.push('• 移液管：' + formatNumber(stockVol_mL) + ' mL')
    steps.push('• 容量瓶：' + volDisplay)
  } else {
    steps.push('• 天平（精度：0.001 g 或更高）')
    steps.push('• 烧杯（容量 > ' + formatNumber(volL * 1000) + ' mL）')
    steps.push('• 玻璃棒（搅拌用）')
    steps.push('• 容量瓶：' + volDisplay)
    steps.push('• 胶头滴管（定容用）')
  }
  steps.push('')
  
  // 准备部分
  if (!isDilute) {
    steps.push('【准备步骤】')
    steps.push('1. 检查并校零天平，确保误差在规范范围内')
    steps.push('2. 准备洁净、干燥的称量容器')
    if (hydrate) {
      steps.push('3. 确认所用 ' + solute + ' 为 ' + hydrate + '水合物形式')
    }
    steps.push('')
  }
  
  // 称量/取液部分
  steps.push('【操作步骤】')
  if (isDilute) {
    steps.push('步骤 1：用移液管吸取 ' + formatNumber(stockVol_mL) + ' mL 母液，放入 ' + volDisplay + ' 容量瓶中')
  } else {
    steps.push('步骤 1：称量 ' + formatNumber(mass_g) + ' g ' + solute)
    steps.push('  • 将称量容器放在天平上，按清零键')
    steps.push('  • 逐次加入固体，直到显示 ' + formatNumber(mass_g) + ' g（精度 ±0.001 g）')
  }
  steps.push('')
  
  // 溶解部分
  if (!isDilute) {
    steps.push('步骤 2：溶解')
    steps.push('  • 向烧杯中加入约 50-100 mL 蒸馏水')
    steps.push('  • 将称量好的 ' + solute + ' 加入烧杯中')
    steps.push('  • 用玻璃棒搅拌直至完全溶解（需要时可加热至 40-50℃）')
    steps.push('  • 冷却至室温')
    steps.push('')
    
    // 转移部分
    steps.push('步骤 3：转移到容量瓶')
    steps.push('  • 将溶液完全转移到 ' + volDisplay + ' 容量瓶中')
    steps.push('  • 用蒸馏水冲洗烧杯和玻璃棒 3-5 次，倒入容量瓶')
    steps.push('  • 沿玻璃棒缓缓加水至液面距瓶口 1-2 cm 处')
    steps.push('')
  }
  
  // 定容部分
  steps.push('步骤 ' + (isDilute ? '2' : '4') + '：定容')
  steps.push('  • 用胶头滴管逐滴添加蒸馏水至液面与刻度线平齐')
  steps.push('  • 液面应与刻度线下沿相切（眼睛与刻度线保持水平）')
  steps.push('')
  
  // 检查和保存部分
  steps.push('步骤 ' + (isDilute ? '3' : '5') + '：检查与保存')
  steps.push('  • 盖上瓶盖并轻轻翻转混合 10 次以上')
  steps.push('  • 检查是否有渗漏，若无则贴标签')
  steps.push('  • 标签注明：溶质名称、浓度、配制日期、配制人员')
  steps.push('  • 密闭保存在阴凉干燥处')
  
  return steps.join('\n')
}

function computeAndSetMwFromDB(){
  const name = $('soluteName').value.trim(); const molEl = $('molarMass'); const hydrate = parseInt($('hydrateCount').value || '0',10) || 0
  if (soluteDB[name] && soluteDB[name].mw){ const base = soluteDB[name].mw; const computed = base + hydrate * HYDRATE_MW; if (!manualMw) molEl.value = computed; const cm = $('computedMwVal'); if (cm) cm.textContent = computed.toFixed(5); const cEl = $('computedMw'); if (cEl) cEl.style.display = 'block' } else { const cEl = $('computedMw'); if (cEl) cEl.style.display = 'none' }
}

function performCalculation(){
  showMessage('')
  const solute = $('soluteName').value.trim() || '未填写'
  const mw = parseFloat($('molarMass').value)
  const concVal = parseFloat($('concValue').value)
  const concUnit = $('concUnit').value
  const volVal = parseFloat($('volValue').value)
  const volUnit = $('volUnit').value
  const mode = $('mode').value
  const hydrate = parseInt($('hydrateCount').value || '0',10) || 0
  const resultLines = []
  let mass_g = NaN, stockVol_mL = NaN
  
  if (isNaN(concVal) || concVal <= 0){ showMessage('请输入正的目标浓度值。'); return }
  if (isNaN(volVal) || volVal <= 0){ showMessage('请输入正的目标体积值。'); return }
  const volL = toLiters(volVal, volUnit)
  
  if (mode === 'solid'){
    // 计算所需质量（支持多种单位）
    if (concUnit === 'M'){
      if (isNaN(mw) || mw<=0){ showMessage('摩尔质量缺失或无效，请填写或从数据库选择溶质。'); return }
      mass_g = concVal * volL * mw
      resultLines.push(`${solute}：需称量 ${formatNumber(mass_g)} g（${concVal} M，${formatNumber(volL)} L）`)
    } else if (concUnit === 'mM'){
      if (isNaN(mw) || mw<=0){ showMessage('摩尔质量缺失或无效，请填写或从数据库选择溶质。'); return }
      mass_g = (concVal/1000) * volL * mw
      resultLines.push(`${solute}：需称量 ${formatNumber(mass_g)} g（${concVal} mM，${formatNumber(volL)} L）`)
    } else if (concUnit === 'μM'){
      if (isNaN(mw) || mw<=0){ showMessage('摩尔质量缺失或无效，请填写或从数据库选择溶质。'); return }
      mass_g = (concVal/1000000) * volL * mw
      resultLines.push(`${solute}：需称量 ${formatNumber(mass_g)} g（${concVal} μM，${formatNumber(volL)} L）`)
    } else if (concUnit === 'g/L'){
      mass_g = concVal * volL; resultLines.push(`${solute}：需称量 ${formatNumber(mass_g)} g（${concVal} g/L，${formatNumber(volL)} L）`)
    } else if (concUnit === 'mg/L'){
      mass_g = (concVal/1000) * volL; resultLines.push(`${solute}：需称量 ${formatNumber(mass_g)} g（${concVal} mg/L，${formatNumber(volL)} L）`)
    } else if (concUnit === 'μg/L'){
      mass_g = (concVal/1000000) * volL; resultLines.push(`${solute}：需称量 ${formatNumber(mass_g)} g（${concVal} μg/L，${formatNumber(volL)} L）`)
    } else if (concUnit === '%'){
      mass_g = concVal * (volL*10); resultLines.push(`${solute}：需称量 ${formatNumber(mass_g)} g（${concVal}% w/v，${formatNumber(volL)} L）`)
    } else if (concUnit === 'ppm'){
      mass_g = (concVal/1000) * volL; resultLines.push(`${solute}：需称量 ${formatNumber(mass_g)} g（${concVal} ppm，${formatNumber(volL)} L）`)
    } else if (concUnit === 'ppb'){
      mass_g = (concVal/1000000) * volL; resultLines.push(`${solute}：需称量 ${formatNumber(mass_g)} g（${concVal} ppb，${formatNumber(volL)} L）`)
    }
    
    // 检查溶解度
    const dbEntry = soluteDB[$('soluteName').value.trim()]
    if (dbEntry && typeof dbEntry.solubility_g_per_L === 'number' && volL>0){ 
      const needed_g_per_L = mass_g / volL
      if (needed_g_per_L > dbEntry.solubility_g_per_L){ 
        resultLines.push(`警告：所需浓度 ${formatNumber(needed_g_per_L)} g/L 超过已知溶解度 ${dbEntry.solubility_g_per_L} g/L，可能无法完全溶解。`)
        showMessage('警告：配方可能超过溶解度，请检查溶解条件或减少浓度。') 
      } 
    }
  } else if (mode === 'dilute'){
    const stockConcVal = parseFloat($('stockConcValue').value)
    const stockConcUnit = $('stockConcUnit').value
    if (isNaN(stockConcVal) || stockConcVal <=0 ){ showMessage('请输入正的母液浓度。'); return }
    const targetMol = concToMolPerL(concVal, concUnit, mw)
    const stockMol = concToMolPerL(stockConcVal, stockConcUnit, mw)
    if (isNaN(targetMol) || isNaN(stockMol)){ showMessage('无法转换所选单位，请检查摩尔质量与单位。'); return }
    if (stockMol === 0){ showMessage('母液浓度不能为 0。'); return }
    const V1_L = targetMol * volL / stockMol
    stockVol_mL = V1_L * 1000
    resultLines.push(`从母液稀释：取母液 ${formatNumber(stockVol_mL)} mL，补至 ${formatNumber(volL)} L（目标 ${concVal} ${concUnit}）`)
  }
  
  // 显示计算结果
  const resEl = $('result')
  if (resEl) resEl.textContent = resultLines.join('\n') || '无结果'
  
  // 生成配制步骤
  const stepsContainer = $('stepsContainer')
  const stepsDiv = $('steps')
  if (stepsContainer && stepsDiv) {
    const stepsText = generateStepsGuide(solute, mw, mass_g, concVal, concUnit, volVal, volUnit, volL, hydrate, mode, stockVol_mL)
    stepsDiv.textContent = stepsText
    stepsContainer.style.display = 'block'
  }
}

// === Tab switching ===
function showTab(id){ 
  document.querySelectorAll('.tabContent').forEach(el=>el.style.display='none')
  document.querySelectorAll('.tabBtn').forEach(b=>b.classList.remove('active'))
  const btn = document.querySelector(`.tabBtn[data-tab="${id}"]`)
  if (btn) btn.classList.add('active')
  const tab = document.getElementById(id)
  if (tab) tab.style.display = 'block'
}

// === Initialize on DOMContentLoaded ===
document.addEventListener('DOMContentLoaded', ()=>{
  console.log('DOMContentLoaded - initializing app')
  
  // Load DB and render table
  loadDBFromStorage()
  renderDbTable()

  // DB import file handler
  const importBtn = $('importFileBtn')
  if (importBtn) {
    importBtn.addEventListener('click', ()=>{
      const fi = $('dbFile')
      if (!fi || !fi.files || fi.files.length===0){ $('dbMsg').textContent='请先选择文件。'; return }
      const f = fi.files[0]
      const reader = new FileReader()
      reader.onload = (e)=>{
        try{
          const text = e.target.result
          if (f.name.endsWith('.json')){ 
            const parsed = JSON.parse(text)
            if (typeof parsed === 'object'){ 
              saveDBToStorage(parsed)
              $('dbMsg').textContent='JSON 导入成功。'
              renderDbTable()
              updateSoluteDatalist()
              return
            }
          }
          const added = importDbFromText(text)
          $('dbMsg').textContent = `导入完成，更新/添加 ${added.length} 条。`
        }catch(err){ $('dbMsg').textContent = '导入失败：'+err.message }
      }
      reader.readAsText(f)
    })
  }

  // DB export button
  const exportBtn = $('exportDbBtn')
  if (exportBtn) {
    exportBtn.addEventListener('click', ()=>{ 
      exportDbToFile()
      $('dbMsg').textContent='已导出数据库。' 
    })
  }

  // DB reset button
  const resetBtn = $('resetDbBtn')
  if (resetBtn) {
    resetBtn.addEventListener('click', ()=>{ 
      saveDBToStorage(Object.assign({}, defaultSoluteDB))
      renderDbTable()
      updateSoluteDatalist()
      $('dbMsg').textContent='已恢复默认数据库。' 
    })
  }

  // DB add/save entry button
  const addBtn = $('addEntryBtn')
  if (addBtn) {
    addBtn.addEventListener('click', ()=>{ 
      if (addBtn.textContent === '保存') {
        finishEditOrAdd()
      } else {
        addDbEntryFromInputs()
      }
    })
  }

  // Calculator mode toggle (show/hide stock section)
  const modeEl = $('mode')
  const stockSection = $('stockSection')
  if (modeEl && stockSection) {
    modeEl.addEventListener('change', ()=>{ 
      stockSection.style.display = modeEl.value === 'dilute' ? 'block' : 'none' 
    })
  }

  // Calculator button
  const calcBtn = $('calcBtn')
  if (calcBtn) {
    calcBtn.addEventListener('click', performCalculation)
  }

  // Clear button
  const clearBtn = $('clearBtn')
  if (clearBtn) {
    clearBtn.addEventListener('click', ()=>{ 
      ['soluteName','molarMass','concValue','volValue','stockConcValue'].forEach(id=>{
        const el=$(id)
        if (el) el.value = ''
      })
      const resEl = $('result')
      if (resEl) resEl.textContent='—'
      const stepsContainer = $('stepsContainer')
      if (stepsContainer) stepsContainer.style.display = 'none'
      showMessage('')
    })
  }

  // Solute name auto-fill from DB
  const solInput = $('soluteName')
  if (solInput) {
    solInput.addEventListener('input', ()=>{
      const name = solInput.value.trim()
      if (name && soluteDB[name] && name !== lastSelectedSolute){
        manualMw = false
        lastSelectedSolute = name
        computeAndSetMwFromDB()
        return
      }
      lastSelectedSolute = (name && soluteDB[name]) ? name : null
      computeAndSetMwFromDB()
    })
  }

  // Hydrate count change
  const hydrateEl = $('hydrateCount')
  if (hydrateEl) {
    hydrateEl.addEventListener('input', computeAndSetMwFromDB)
  }

  // Manual MW override
  const molEl = $('molarMass')
  if (molEl) {
    molEl.addEventListener('input', ()=>{ 
      const v = molEl.value
      manualMw = !!(v && v.toString().trim() !== '')
      if (!manualMw) computeAndSetMwFromDB()
    })
  }

  // Print/Export PDF button
  const printBtn = $('printBtn')
  if (printBtn) {
    printBtn.addEventListener('click', ()=>{ 
      const resultText = $('result').textContent
      const stepsText = $('steps').textContent
      const solute = $('soluteName').value.trim() || '未填写'
      const now = new Date().toLocaleString('zh-CN')
      const printContent = `溶液配制计算结果

溶质：${solute}
生成时间：${now}

═════════════════════════════════════

计算结果：
${resultText}

═════════════════════════════════════

${stepsText}

═════════════════════════════════════
注：请按照步骤指南进行操作，确保所有操作的准确性。
`
      const printWindow = window.open('', '', 'width=900,height=1200')
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>溶液配制步骤指南 - ${solute}</title>
          <style>
            body { font-family: "Courier New", monospace; padding: 20px; line-height: 1.6; color: #333; }
            h1 { font-size: 18px; margin-bottom: 10px; }
            h3 { font-size: 14px; margin-top: 20px; margin-bottom: 10px; }
            .section { margin: 20px 0; page-break-inside: avoid; }
            pre { white-space: pre-wrap; word-wrap: break-word; }
            @media print { body { padding: 10px; } }
          </style>
        </head>
        <body>
          <h1>溶液配制步骤指南</h1>
          <p><strong>溶质：</strong>${solute}</p>
          <p><strong>生成时间：</strong>${now}</p>
          <hr>
          <h3>计算结果</h3>
          <pre>${resultText}</pre>
          <hr>
          <h3>操作步骤</h3>
          <pre>${stepsText}</pre>
          <hr>
          <p style="font-size: 12px; color: #666;">注：请按照步骤指南进行操作，确保所有操作的准确性。</p>
        </body>
        </html>
      `)
      printWindow.document.close()
      setTimeout(()=>{ printWindow.print() }, 500)
    })
  }

  // Bind tab buttons
  document.querySelectorAll('.tabBtn').forEach(b=>{
    b.addEventListener('click', ()=>{ 
      showTab(b.getAttribute('data-tab')) 
    })
  })

  // Show calculator tab by default
  showTab('calcTab')
  console.log('Initialization complete')
})
