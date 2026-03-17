const API_URL = "https://script.google.com/macros/s/AKfycby7AULthsG13GplOkKh76lXYgq5uipHP5h7FIKQsYmsfLGteQU-Rrxep7gHeO_mFwofmw/exec";

const FIELDS = ["ESG Impact", "Innovation", "Implementation"];

let state = { teams: [], participants: [], votes: [], ranking: [] };
let selectedParticipantName = "";
let selectedParticipantTeam = "";
let adminToken = "";
let loadingCount = 0;

function showToast(message, isError = false) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.className = "toast show" + (isError ? " error" : "");
  setTimeout(() => (toast.className = "toast"), 1200);
}

function showLoading(message = "로딩중...") {
  loadingCount += 1;
  const overlay = document.getElementById("loadingOverlay");
  const text = overlay.querySelector(".loading-text");
  text.textContent = message;
  overlay.style.display = "flex";
}

function hideLoading() {
  loadingCount = Math.max(0, loadingCount - 1);
  if (loadingCount === 0) {
    document.getElementById("loadingOverlay").style.display = "none";
  }
}

async function withLoading(fn, message = "로딩중...") {
  showLoading(message);
  try {
    return await fn();
  } finally {
    hideLoading();
  }
}

function n(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function toISO(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value ?? "");
  return d.toISOString();
}

function formatDateKOR(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value ?? "");
  return d.toLocaleString("ko-KR");
}

async function apiGetInit() {
  const res = await fetch(`${API_URL}?action=init`, { method: "GET" });
  if (!res.ok) throw new Error(`init failed: ${res.status}`);
  return await res.json();
}

async function apiPost(action, payload) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action, ...payload }),
  });
  if (!res.ok) throw new Error(`post failed: ${res.status}`);
  return await res.json();
}

function getParticipantVotes(participantName) {
  return state.votes.filter(v => String(v["참여자명"] ?? "").trim() === participantName);
}

function getUsedFields(participantName) {
  return getParticipantVotes(participantName).map(v => String(v["투표분야"] ?? "").trim());
}

function getSelectedParticipant() {
  return state.participants.find(p => String(p["참여자명"] ?? "").trim() === selectedParticipantName) || null;
}

function resetToEntry() {
  selectedParticipantName = "";
  selectedParticipantTeam = "";
  adminToken = "";
  document.getElementById("participantPage").style.display = "none";
  document.getElementById("adminPage").style.display = "none";
  document.getElementById("passwordModal").style.display = "none";
  document.getElementById("entryModal").style.display = "flex";
  document.getElementById("entryStepParticipant").style.display = "none";
  document.getElementById("entryStepType").style.display = "block";
  document.getElementById("entryParticipantSelect").innerHTML = `<option value="">불러오는 중...</option>`;
  document.getElementById("passwordInput").value = "";
  document.getElementById("passwordError").textContent = "";
}

document.getElementById("adminBtn").addEventListener("click", () => {
  document.getElementById("entryModal").style.display = "none";
  document.getElementById("passwordModal").style.display = "flex";
});

document.getElementById("participantBtn").addEventListener("click", async () => {
  document.getElementById("entryStepType").style.display = "none";
  document.getElementById("entryStepParticipant").style.display = "block";
  await withLoading(async () => {
    await fillParticipantDropdown();
  }, "참가자 목록 불러오는 중...");
});

document.getElementById("entryParticipantBack").addEventListener("click", () => {
  document.getElementById("entryStepParticipant").style.display = "none";
  document.getElementById("entryStepType").style.display = "block";
  document.getElementById("entryParticipantSelect").value = "";
});

document.getElementById("entryParticipantEnter").addEventListener("click", async () => {
  const name = document.getElementById("entryParticipantSelect").value;
  if (!name) return showToast("참가자를 선택해주세요", true);

  selectedParticipantName = name;
  const participant = state.participants.find(p => String(p["참여자명"] ?? "").trim() === name);
  selectedParticipantTeam = String(participant?.["소속팀"] ?? "").trim();

  document.getElementById("entryModal").style.display = "none";
  document.getElementById("participantPage").style.display = "block";

  await withLoading(async () => {
    await initParticipantPage();
  }, "투표 화면 준비중...");
});

document.getElementById("passwordCancel").addEventListener("click", () => {
  resetToEntry();
});

document.getElementById("passwordSubmit").addEventListener("click", async () => {
  const input = document.getElementById("passwordInput").value.trim();
  const errorEl = document.getElementById("passwordError");

  if (!input) {
    errorEl.textContent = "비밀번호를 입력해주세요";
    return;
  }

  await withLoading(async () => {
    try {
      const resp = await apiPost("adminLogin", { password: input });
      if (!resp.success) {
        errorEl.textContent = "비밀번호가 일치하지 않습니다";
        return;
      }
      adminToken = resp.token || "";
      errorEl.textContent = "";
      document.getElementById("passwordModal").style.display = "none";
      document.getElementById("adminPage").style.display = "block";
      await initAdminPage();
    } catch (e) {
      console.error(e);
      errorEl.textContent = "로그인에 실패했습니다";
    }
  }, "관리자 로그인중...");
});

document.getElementById("passwordInput").addEventListener("keypress", (e) => {
  if (e.key === "Enter") document.getElementById("passwordSubmit").click();
});

document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    const tabName = btn.dataset.tab;
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(tabName + "Tab").classList.add("active");
  });
});

async function loadFromSheet() {
  const data = await apiGetInit();
  if (data.error) throw new Error(data.error);
  state.teams = Array.isArray(data.teams) ? data.teams : [];
  state.participants = Array.isArray(data.participants) ? data.participants : [];
  state.votes = Array.isArray(data.votes) ? data.votes : [];
  state.ranking = Array.isArray(data.ranking) ? data.ranking : [];
}

async function fillParticipantDropdown() {
  try {
    await loadFromSheet();
    const select = document.getElementById("entryParticipantSelect");
    select.innerHTML = `<option value="">참가자를 선택하세요</option>`;

    state.participants.forEach(p => {
      const name = String(p["참여자명"] ?? "").trim();
      if (!name) return;
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      select.appendChild(opt);
    });
  } catch (e) {
    console.error(e);
    document.getElementById("entryParticipantSelect").innerHTML = `<option value="">불러오기 실패</option>`;
    showToast("참가자 목록을 불러오지 못했습니다", true);
  }
}

async function initAdminPage() {
  await loadFromSheet();
  document.getElementById("lastSyncText").textContent = `마지막 동기화: ${new Date().toLocaleString("ko-KR")}`;
  renderAdminAll();
}

document.getElementById("syncBtn").addEventListener("click", async () => {
  await withLoading(async () => {
    try {
      await initAdminPage();
      showToast("불러오기 완료");
    } catch (e) {
      console.error(e);
      showToast("불러오기에 실패했습니다", true);
    }
  }, "데이터 불러오는 중...");
});

function renderAdminAll() {
  renderTeamsTable();
  renderParticipantsTable();
  renderVotesTable();
  renderRankingTable();
}

function renderTeamsTable() {
  const tbody = document.querySelector("#teamsTable tbody");
  tbody.innerHTML = "";

  state.teams.forEach((t, index) => {
    const teamName = String(t["팀명"] ?? "").trim();
    const rankRow = state.ranking.find(r => String(r["팀명"] ?? "").trim() === teamName);
    const total = n(rankRow?.["총득표"] ?? 0);

    const row = document.createElement("tr");
    row.innerHTML = `
      <td><input type="text" value="${escapeHtml(teamName)}" data-type="team" data-field="팀명" data-index="${index}"></td>
      <td><input type="text" value="${escapeHtml(t["타이틀"] ?? "")}" data-type="team" data-field="타이틀" data-index="${index}"></td>
      <td><textarea data-type="team" data-field="주제" data-index="${index}">${escapeHtml(t["주제"] ?? "")}</textarea></td>
      <td><textarea data-type="team" data-field="세부설명" data-index="${index}">${escapeHtml(t["세부설명"] ?? "")}</textarea></td>
      <td><input type="text" value="${escapeHtml(t["이미지파일명"] ?? "")}" data-type="team" data-field="이미지파일명" data-index="${index}"></td>
      <td><input type="number" class="readonly" value="${total}" readonly></td>
      <td><button class="delete-row-btn" data-type="team" data-index="${index}">삭제</button></td>
    `;
    tbody.appendChild(row);
  });

  tbody.querySelectorAll(".delete-row-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const idx = parseInt(e.target.dataset.index, 10);
      state.teams.splice(idx, 1);
      renderTeamsTable();
    });
  });

  tbody.querySelectorAll("[data-type='team']").forEach(inp => {
    inp.addEventListener("input", (e) => {
      const i = parseInt(e.target.dataset.index, 10);
      const field = e.target.dataset.field;
      state.teams[i][field] = e.target.value;
    });
  });
}

function renderParticipantsTable() {
  const tbody = document.querySelector("#participantsTable tbody");
  tbody.innerHTML = "";

  state.participants.forEach((p, index) => {
    const name = String(p["참여자명"] ?? "").trim();
    const ownTeam = String(p["소속팀"] ?? "").trim();
    const usedFields = getUsedFields(name);

    const row = document.createElement("tr");
    row.innerHTML = `
      <td><input type="text" value="${escapeHtml(name)}" data-type="participant" data-field="참여자명" data-index="${index}"></td>
      <td><input type="text" value="${escapeHtml(ownTeam)}" data-type="participant" data-field="소속팀" data-index="${index}"></td>
      <td><input type="text" class="readonly" value="${escapeHtml(usedFields.join(", "))}" readonly></td>
      <td><button class="delete-row-btn" data-type="participant" data-index="${index}">삭제</button></td>
    `;
    tbody.appendChild(row);
  });

  tbody.querySelectorAll(".delete-row-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const idx = parseInt(e.target.dataset.index, 10);
      state.participants.splice(idx, 1);
      renderParticipantsTable();
    });
  });

  tbody.querySelectorAll("[data-type='participant']").forEach(inp => {
    inp.addEventListener("input", (e) => {
      const i = parseInt(e.target.dataset.index, 10);
      const field = e.target.dataset.field;
      state.participants[i][field] = e.target.value;
    });
  });
}

function renderVotesTable() {
  const tbody = document.querySelector("#votesTable tbody");
  tbody.innerHTML = "";

  state.votes.forEach((v, index) => {
    const tsRaw = v["일시"];
    const tsIso = toISO(tsRaw);
    const participantName = String(v["참여자명"] ?? "").trim();
    const ownTeam = String(v["소속팀"] ?? "").trim();
    const field = String(v["투표분야"] ?? "").trim();
    const votedTeam = String(v["투표팀명"] ?? "").trim();

    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${escapeHtml(formatDateKOR(tsRaw))}</td>
      <td>${escapeHtml(participantName)}</td>
      <td>${escapeHtml(ownTeam)}</td>
      <td>${escapeHtml(field)}</td>
      <td>${escapeHtml(votedTeam)}</td>
      <td><button class="delete-row-btn" data-index="${index}">삭제</button></td>
    `;
    tbody.appendChild(row);

    row.querySelector(".delete-row-btn").addEventListener("click", async () => {
      if (!confirm("이 투표내역을 삭제할까요?")) return;

      await withLoading(async () => {
        try {
          const resp = await apiPost("deleteVote", {
            token: adminToken,
            ts: tsIso,
            participantName,
            ownTeam,
            field,
            votedTeam
          });

          if (!resp.success) {
            if (resp.error === "unauthorized") {
              showToast("관리자 인증이 만료되었습니다. 다시 로그인해주세요", true);
              resetToEntry();
              return;
            }
            throw new Error(resp.error || "delete failed");
          }

          await loadFromSheet();
          renderAdminAll();
          showToast("삭제되었습니다");
        } catch (e) {
          console.error(e);
          showToast("삭제에 실패했습니다", true);
        }
      }, "삭제 처리중...");
    });
  });
}

function renderRankingTable() {
  const tbody = document.querySelector("#rankingTable tbody");
  tbody.innerHTML = "";

  state.ranking.forEach(r => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${escapeHtml(r["팀명"] ?? "")}</td>
      <td>${escapeHtml(r["타이틀"] ?? "")}</td>
      <td>${n(r["ESG Impact"] ?? 0)}</td>
      <td>${n(r["Innovation"] ?? 0)}</td>
      <td>${n(r["Implementation"] ?? 0)}</td>
      <td>${n(r["총득표"] ?? 0)}</td>
    `;
    tbody.appendChild(row);
  });
}

document.getElementById("addTeamBtn").addEventListener("click", () => {
  state.teams.push({
    "팀명": "",
    "타이틀": "",
    "주제": "",
    "세부설명": "",
    "이미지파일명": ""
  });
  renderTeamsTable();
});

document.getElementById("addParticipantBtn").addEventListener("click", () => {
  state.participants.push({
    "참여자명": "",
    "소속팀": ""
  });
  renderParticipantsTable();
});

document.getElementById("saveAdminBtn").addEventListener("click", async () => {
  const saveBtn = document.getElementById("saveAdminBtn");

  await withLoading(async () => {
    try {
      const teamNames = new Set();
      for (const t of state.teams) {
        const name = String(t["팀명"] ?? "").trim();
        if (!name) return showToast("팀명을 입력해주세요", true);
        if (teamNames.has(name)) return showToast(`팀명 중복: ${name}`, true);
        teamNames.add(name);
      }

      const participantNames = new Set();
      for (const p of state.participants) {
        const name = String(p["참여자명"] ?? "").trim();
        if (!name) return showToast("참여자명을 입력해주세요", true);
        if (participantNames.has(name)) return showToast(`참여자명 중복: ${name}`, true);
        participantNames.add(name);
      }

      saveBtn.disabled = true;
      saveBtn.textContent = "저장중...";

      const r1 = await apiPost("saveTeams", {
        token: adminToken,
        teams: state.teams
      });
      if (!r1.success) throw new Error(r1.error || "saveTeams failed");

      const r2 = await apiPost("saveParticipants", {
        token: adminToken,
        participants: state.participants
      });
      if (!r2.success) throw new Error(r2.error || "saveParticipants failed");

      await loadFromSheet();
      renderAdminAll();
      showToast("적용되었습니다");
    } catch (e) {
      console.error(e);
      showToast("저장에 실패했습니다", true);
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = "저장";
    }
  }, "저장중...");
});

document.getElementById("clearVotesBtn").addEventListener("click", async () => {
  if (!confirm("모든 투표내역을 삭제하시겠습니까?")) return;

  await withLoading(async () => {
    try {
      const r = await apiPost("clearVotes", { token: adminToken });
      if (!r.success) throw new Error(r.error || "clear failed");

      await loadFromSheet();
      renderAdminAll();
      showToast("투표내역이 모두 삭제되었습니다");
    } catch (e) {
      console.error(e);
      showToast("전체 삭제에 실패했습니다", true);
    }
  }, "전체 삭제중...");
});

async function initParticipantPage() {
  await loadFromSheet();

  const participant = getSelectedParticipant();
  if (!participant) {
    showToast("참가자 정보를 찾을 수 없습니다", true);
    resetToEntry();
    return;
  }

  selectedParticipantTeam = String(participant["소속팀"] ?? "").trim();

  document.getElementById("fixedParticipantName").textContent = selectedParticipantName;
  document.getElementById("fixedParticipantTeam").textContent = selectedParticipantTeam || "-";
  document.getElementById("participantResetBtn").onclick = () => resetToEntry();

  renderParticipantPage();
}

function renderParticipantPage() {
  renderFieldStatus();
  renderMyVoteSummary();
  renderTeamCards();
}

function renderFieldStatus() {
  const wrap = document.getElementById("fieldStatus");
  const usedFields = getUsedFields(selectedParticipantName);

  wrap.innerHTML = "";
  FIELDS.forEach(field => {
    const chip = document.createElement("div");
    chip.className = "score-chip " + (usedFields.includes(field) ? "used" : "remain");
    chip.textContent = usedFields.includes(field) ? `${field} 투표 완료` : `${field} 투표 가능`;
    wrap.appendChild(chip);
  });
}

function renderMyVoteSummary() {
  const wrap = document.getElementById("myVoteSummary");
  const list = document.getElementById("myVoteList");
  const myVotes = getParticipantVotes(selectedParticipantName);

  if (myVotes.length === 0) {
    wrap.style.display = "none";
    return;
  }

  wrap.style.display = "block";
  list.innerHTML = "";

  myVotes.forEach(v => {
    const row = document.createElement("div");
    row.className = "my-vote-row";
    row.innerHTML = `
      <div>
        <div class="mv-team">${escapeHtml(v["투표팀명"] ?? "")}</div>
        <div class="mv-field">${escapeHtml(v["투표분야"] ?? "")}</div>
      </div>
      <div class="mv-score">완료</div>
    `;
    list.appendChild(row);
  });
}

function renderTeamCards() {
  const container = document.getElementById("teamsContainer");
  container.innerHTML = "";

  const usedFields = getUsedFields(selectedParticipantName);

  state.teams.forEach(team => {
    const teamName = String(team["팀명"] ?? "").trim();
    const title = String(team["타이틀"] ?? "").trim();
    const topic = String(team["주제"] ?? "").trim();
    const detail = String(team["세부설명"] ?? "").trim();
    const imageUrl = String(team["이미지URL"] ?? "").trim();

    const rankRow = state.ranking.find(r => String(r["팀명"] ?? "").trim() === teamName);
    const totalVotes = n(rankRow?.["총득표"] ?? 0);

    const isOwnTeam = selectedParticipantTeam && selectedParticipantTeam === teamName;
    const myVotes = getParticipantVotes(selectedParticipantName);

    let voteButtonsHtml = "";
    if (isOwnTeam) {
      voteButtonsHtml = `<button class="vote-btn blocked" disabled>자기 팀에는 투표할 수 없습니다</button>`;
    } else {
      voteButtonsHtml = FIELDS.map(field => {
        const alreadyUsed = usedFields.includes(field);
        const votedThisFieldForThisTeam = myVotes.some(v =>
          String(v["투표분야"] ?? "").trim() === field &&
          String(v["투표팀명"] ?? "").trim() === teamName
        );

        if (alreadyUsed || votedThisFieldForThisTeam) {
          return `<button class="vote-btn blocked" disabled>${field} 완료</button>`;
        }

        return `<button class="vote-btn" data-team="${escapeHtml(teamName)}" data-field="${escapeHtml(field)}">${field} 투표</button>`;
      }).join("");
    }

    const imageHtml = imageUrl
      ? `<div class="team-image-wrap"><img class="team-image" src="${escapeHtml(imageUrl)}" alt="${escapeHtml(teamName)}" loading="lazy"></div>`
      : `<div class="team-image-wrap"><div class="team-image-placeholder">등록된 이미지가 없습니다</div></div>`;

    const card = document.createElement("div");
    card.className = "team-card";
    card.innerHTML = `
      ${imageHtml}
      <div class="team-header">
        <div class="team-name">${escapeHtml(teamName)}</div>
        <div class="team-total-badge">총득표 ${totalVotes}</div>
      </div>

      <div class="team-title">${escapeHtml(title)}</div>

      <div class="team-grid">
        <div class="team-info-box">
          <div class="team-info-label">주제</div>
          <div class="team-info-value">${escapeHtml(topic)}</div>
        </div>
        <div class="team-info-box">
          <div class="team-info-label">세부설명</div>
          <div class="team-info-value">${escapeHtml(detail)}</div>
        </div>
      </div>

      <div class="vote-section">
        <div class="vote-notice">각 분야(ESG Impact / Innovation / Implementation)는 각각 1회만 투표할 수 있습니다.</div>
        <div class="vote-btn-group">${voteButtonsHtml}</div>
      </div>
    `;

    card.querySelectorAll(".vote-btn[data-team]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const field = btn.dataset.field;
        await handleVote(teamName, field, btn);
      });
    });

    container.appendChild(card);
  });
}

async function handleVote(teamName, field, buttonEl) {
  buttonEl.disabled = true;
  buttonEl.textContent = "처리중...";

  await withLoading(async () => {
    try {
      const resp = await apiPost("castVote", {
        participantName: selectedParticipantName,
        teamName,
        field
      });

      if (!resp.success) {
        if (resp.error === "self vote not allowed") {
          showToast("자기 팀에는 투표할 수 없습니다", true);
        } else if (resp.error === "field already used") {
          showToast("해당 분야는 이미 투표했습니다", true);
        } else {
          showToast("투표에 실패했습니다", true);
        }
        await loadFromSheet();
        renderParticipantPage();
        return;
      }

      await loadFromSheet();
      renderParticipantPage();
      showToast(`${field} 분야 투표가 반영되었습니다`);
    } catch (e) {
      console.error(e);
      showToast("투표에 실패했습니다", true);
    }
  }, "투표 반영중...");
}

document.getElementById("entryModal").style.display = "flex";
resetToEntry();