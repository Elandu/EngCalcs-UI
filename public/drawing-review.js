import * as pdfjs from "/vendor/pdfjs/pdf.min.mjs";

pdfjs.GlobalWorkerOptions.workerSrc = "/vendor/pdfjs/pdf.worker.min.mjs";

const MAX_DOCUMENTS = 10;
const MAX_DOCUMENT_BYTES = 50 * 1024 * 1024;
const MAX_TOTAL_BYTES = 100 * 1024 * 1024;
const DB_NAME = "opencalcs-drawing-review";
const DB_VERSION = 1;
const ACTIVE_PROJECT_ID = new URLSearchParams(window.location.search).get("projectId") || "";
const ACTIVE_WORKSPACE_ID = ACTIVE_PROJECT_ID ? "project:" + ACTIVE_PROJECT_ID : "unassigned";
const SVG_NS = "http://www.w3.org/2000/svg";
const MARK_TYPES = {
  beam: { label: "Beam", prefix: "B", color: "#32a878", symbol: "B" },
  column: { label: "Column", prefix: "C", color: "#d89b43", symbol: "C" },
  area: { label: "Area", prefix: "A", color: "#518dc8", symbol: "A" },
};
const TOOL_HINTS = {
  select: "Select a markup to inspect or link its calculation.",
  beam: "Drag along a beam or brace to add a line markup.",
  column: "Click a column location to add a point markup.",
  area: "Drag around a wall, bay, or other area to mark its extent.",
};

const el = (id) => document.getElementById(id);
const ui = {
  projectName: el("project-name"),
  saveStatus: el("save-status"),
  exportPdf: el("export-pdf"),
  fileInput: el("pdf-files"),
  dropzone: el("upload-dropzone"),
  documentList: el("document-list"),
  documentCount: el("document-count"),
  activeDocument: el("active-document"),
  previousPage: el("previous-page"),
  nextPage: el("next-page"),
  pageNumber: el("page-number"),
  pageTotal: el("page-total"),
  zoomIn: el("zoom-in"),
  zoomOut: el("zoom-out"),
  zoomFit: el("zoom-fit"),
  viewerScroll: el("viewer-scroll"),
  emptyViewer: el("empty-viewer"),
  pageStage: el("page-stage"),
  pageFrame: el("page-frame"),
  canvas: el("pdf-canvas"),
  annotationLayer: el("annotation-layer"),
  viewerMessage: el("viewer-message"),
  drawingCaption: el("drawing-caption"),
  annotationCount: el("annotation-count"),
  annotationList: el("annotation-list"),
  annotationEditor: el("annotation-editor"),
  selectedMarkupKind: el("selected-markup-kind"),
  annotationLabel: el("annotation-label"),
  linkedCalculation: el("linked-calculation"),
  deleteAnnotation: el("delete-annotation"),
  toolHint: el("tool-hint"),
  calculationPicker: el("calculation-picker"),
  calculationDescription: el("calculation-description"),
  calculationInputs: el("calculation-inputs"),
  calculationSchema: el("calculation-schema"),
  showSchema: el("show-schema"),
  schemaPanel: el("schema-panel"),
  runCalculation: el("run-calculation"),
  calculationError: el("calculation-error"),
  calculationResult: el("calculation-result"),
  resultTitle: el("result-title"),
  resultStandard: el("result-standard"),
  resultOutput: el("result-output"),
  linkResult: el("link-result"),
};

let database;
let workspace = {
  id: ACTIVE_WORKSPACE_ID,
  name: "Untitled drawing set",
  documents: [],
  annotations: [],
  calculations: [],
};
let selectedAnnotationId = null;
let activeCalculationId = null;
let currentResultId = null;
let calculationCatalog = [];
let activeTool = "select";
let currentViewport = null;
let currentRenderTask = null;
let zoomFactor = 1;
let renderCounter = 0;
let saveTimer = null;
let resizeTimer = null;
let pointerAnchor = null;
let draftElement = null;
let pdfLibPromise = null;
const loadedDocuments = new Map();

function uuid() {
  return crypto.randomUUID ? crypto.randomUUID() : (Date.now().toString(36) + Math.random().toString(36).slice(2));
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("This browser does not support IndexedDB."));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("workspaces")) {
        db.createObjectStore("workspaces", { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Could not open local drawing storage."));
  });
}

function readWorkspace() {
  return new Promise((resolve, reject) => {
    const request = database.transaction("workspaces", "readonly").objectStore("workspaces").get(ACTIVE_WORKSPACE_ID);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

function writeWorkspace() {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction("workspaces", "readwrite");
    transaction.objectStore("workspaces").put(workspace);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("Browser storage rejected the save."));
    transaction.onabort = () => reject(transaction.error || new Error("Browser storage cancelled the save."));
  });
}

function setSaveStatus(value, state) {
  ui.saveStatus.textContent = value;
  ui.saveStatus.classList.toggle("is-saving", state === "saving");
  ui.saveStatus.classList.toggle("has-error", state === "error");
}

function scheduleSave() {
  if (!database) {
    setSaveStatus("Session only", "error");
    return;
  }
  clearTimeout(saveTimer);
  setSaveStatus("Saving locally…", "saving");
  saveTimer = setTimeout(async () => {
    try {
      await writeWorkspace();
      setSaveStatus("Saved in this browser", "saved");
    } catch (error) {
      setSaveStatus("Local save failed", "error");
      showViewerMessage("The browser could not save this drawing set. Export the marked PDF before closing this tab. " + safeMessage(error));
    }
  }, 220);
}

function safeMessage(error) {
  return error && typeof error.message === "string" ? error.message.slice(0, 300) : "Please try again.";
}

function showViewerMessage(message) {
  ui.viewerMessage.textContent = message;
  ui.viewerMessage.hidden = false;
}

function clearViewerMessage() {
  ui.viewerMessage.hidden = true;
  ui.viewerMessage.textContent = "";
}

function activeDocument() {
  return workspace.documents.find((document) => document.id === workspace.activeDocumentId) || null;
}

function visibleAnnotations() {
  const document = activeDocument();
  if (!document) return [];
  return workspace.annotations.filter((mark) => mark.documentId === document.id && mark.pageNumber === document.pageNumber);
}

function updateWorkspaceTitle() {
  const cleaned = ui.projectName.value.trim();
  workspace.name = cleaned || "Untitled drawing set";
  scheduleSave();
}

function renderDocumentList() {
  ui.documentList.replaceChildren();
  ui.documentCount.textContent = String(workspace.documents.length);
  ui.activeDocument.replaceChildren();
  for (const document of workspace.documents) {
    const option = window.document.createElement("option");
    option.value = document.id;
    option.textContent = document.name;
    ui.activeDocument.append(option);

    const row = window.document.createElement("div");
    row.className = "document-row" + (document.id === workspace.activeDocumentId ? " is-active" : "");
    row.tabIndex = 0;
    row.setAttribute("role", "button");
    row.setAttribute("aria-label", "Open " + document.name);
    row.addEventListener("click", () => selectDocument(document.id));
    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        selectDocument(document.id);
      }
    });

    const icon = window.document.createElement("span");
    icon.className = "pdf-icon";
    icon.textContent = "PDF";
    const info = window.document.createElement("span");
    info.className = "document-info";
    const title = window.document.createElement("strong");
    title.textContent = document.name;
    const detail = window.document.createElement("small");
    const markCount = workspace.annotations.filter((mark) => mark.documentId === document.id).length;
    detail.textContent = document.pageCount + (document.pageCount === 1 ? " page" : " pages") + " · " + markCount + (markCount === 1 ? " markup" : " markups");
    info.append(title, detail);
    const remove = window.document.createElement("button");
    remove.type = "button";
    remove.className = "document-remove";
    remove.setAttribute("aria-label", "Remove " + document.name);
    remove.textContent = "×";
    remove.addEventListener("click", (event) => {
      event.stopPropagation();
      removeDocument(document.id);
    });
    row.append(icon, info, remove);
    ui.documentList.append(row);
  }
  const hasDocument = workspace.documents.length > 0;
  ui.activeDocument.disabled = !hasDocument;
  ui.exportPdf.disabled = !hasDocument;
  ui.pageNumber.disabled = !hasDocument;
  ui.previousPage.disabled = !hasDocument;
  ui.nextPage.disabled = !hasDocument;
  ui.zoomIn.disabled = !hasDocument;
  ui.zoomOut.disabled = !hasDocument;
  ui.zoomFit.disabled = !hasDocument;
  ui.emptyViewer.hidden = hasDocument;
  ui.pageStage.hidden = !hasDocument || !currentViewport;
  const drawing = activeDocument();
  if (drawing) {
    const markCount = workspace.annotations.filter((mark) => mark.documentId === drawing.id).length;
    ui.drawingCaption.textContent = drawing.name + " · Page " + (drawing.pageNumber || 1) + " · " + markCount + " markups";
  }
}

async function loadPdf(document) {
  const cached = loadedDocuments.get(document.id);
  if (cached) return cached;
  const data = new Uint8Array(await document.blob.arrayBuffer());
  const task = pdfjs.getDocument({
    data,
    isEvalSupported: false,
    enableXfa: false,
    useWorkerFetch: false,
  });
  const pdf = await task.promise;
  loadedDocuments.set(document.id, pdf);
  document.pageCount = pdf.numPages;
  return pdf;
}

async function selectDocument(documentId) {
  workspace.activeDocumentId = documentId;
  const document = activeDocument();
  if (document) document.pageNumber = Math.max(1, Math.min(document.pageNumber || 1, document.pageCount || 1));
  selectedAnnotationId = null;
  currentViewport = null;
  zoomFactor = 1;
  renderDocumentList();
  renderAnnotationPanel();
  await renderPage();
  scheduleSave();
}

function createSvgElement(tagName, attributes) {
  const element = document.createElementNS(SVG_NS, tagName);
  for (const [name, value] of Object.entries(attributes || {})) {
    element.setAttribute(name, String(value));
  }
  return element;
}

function toViewportPoint(point) {
  return currentViewport.convertToViewportPoint(point.x, point.y);
}

function displayBox(mark) {
  const first = toViewportPoint(mark.start);
  const second = toViewportPoint(mark.end);
  return {
    x: Math.min(first[0], second[0]),
    y: Math.min(first[1], second[1]),
    width: Math.abs(second[0] - first[0]),
    height: Math.abs(second[1] - first[1]),
    first,
    second,
  };
}

function renderAnnotationLayer() {
  if (!currentViewport) return;
  const layer = ui.annotationLayer;
  layer.replaceChildren();
  layer.setAttribute("viewBox", "0 0 " + currentViewport.width + " " + currentViewport.height);
  layer.setAttribute("width", currentViewport.width);
  layer.setAttribute("height", currentViewport.height);
  layer.dataset.tool = activeTool;

  for (const mark of visibleAnnotations()) {
    const definition = MARK_TYPES[mark.type] || MARK_TYPES.area;
    const selected = mark.id === selectedAnnotationId;
    const group = createSvgElement("g", { class: "markup-shape", "data-annotation-id": mark.id });
    const shapeAttributes = {
      fill: definition.color + "24",
      stroke: definition.color,
      "stroke-width": selected ? 3 : 2,
      "stroke-linejoin": "round",
      "vector-effect": "non-scaling-stroke",
    };
    if (mark.type === "beam") {
      const start = toViewportPoint(mark.start);
      const end = toViewportPoint(mark.end);
      group.append(createSvgElement("line", {
        x1: start[0], y1: start[1], x2: end[0], y2: end[1],
        ...shapeAttributes, "stroke-linecap": "round",
      }));
      const labelPoint = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2 - 7];
      appendMarkupLabel(group, mark.label, labelPoint, definition.color);
    } else if (mark.type === "column") {
      const point = toViewportPoint(mark.start);
      group.append(createSvgElement("circle", {
        cx: point[0], cy: point[1], r: selected ? 9 : 7, ...shapeAttributes,
      }));
      group.append(createSvgElement("line", {
        x1: point[0] - 4, y1: point[1], x2: point[0] + 4, y2: point[1],
        stroke: definition.color, "stroke-width": 1.5, "vector-effect": "non-scaling-stroke",
      }));
      group.append(createSvgElement("line", {
        x1: point[0], y1: point[1] - 4, x2: point[0], y2: point[1] + 4,
        stroke: definition.color, "stroke-width": 1.5, "vector-effect": "non-scaling-stroke",
      }));
      appendMarkupLabel(group, mark.label, [point[0] + 10, point[1] - 8], definition.color);
    } else {
      const box = displayBox(mark);
      group.append(createSvgElement("rect", {
        x: box.x, y: box.y, width: box.width, height: box.height, ...shapeAttributes,
      }));
      appendMarkupLabel(group, mark.label, [box.x + 4, box.y - 5], definition.color);
    }
    group.addEventListener("click", (event) => {
      if (activeTool === "select") {
        event.stopPropagation();
        selectAnnotation(mark.id);
      }
    });
    layer.append(group);
  }
}

function appendMarkupLabel(group, label, point, color) {
  if (!label) return;
  const text = createSvgElement("text", {
    x: Math.max(3, point[0]),
    y: Math.max(11, point[1]),
    class: "markup-label",
    fill: color,
  });
  text.textContent = label;
  group.append(text);
}

function screenPoint(clientX, clientY) {
  const bounds = ui.annotationLayer.getBoundingClientRect();
  const x = clamp(clientX - bounds.left, 0, currentViewport.width);
  const y = clamp(clientY - bounds.top, 0, currentViewport.height);
  const point = currentViewport.convertToPdfPoint(x, y);
  return { x: Math.round(point[0] * 100) / 100, y: Math.round(point[1] * 100) / 100 };
}

function drawDraft(start, end) {
  if (!currentViewport || !pointerAnchor) return;
  if (draftElement) draftElement.remove();
  const startScreen = [pointerAnchor.screenX, pointerAnchor.screenY];
  const endScreen = [end.screenX, end.screenY];
  if (activeTool === "beam") {
    draftElement = createSvgElement("line", {
      x1: startScreen[0], y1: startScreen[1], x2: endScreen[0], y2: endScreen[1], class: "draft-shape",
    });
  } else {
    draftElement = createSvgElement("rect", {
      x: Math.min(startScreen[0], endScreen[0]),
      y: Math.min(startScreen[1], endScreen[1]),
      width: Math.abs(endScreen[0] - startScreen[0]),
      height: Math.abs(endScreen[1] - startScreen[1]),
      class: "draft-shape",
    });
  }
  ui.annotationLayer.append(draftElement);
}

function nextMarkLabel(type) {
  const prefix = (MARK_TYPES[type] || MARK_TYPES.area).prefix;
  let next = 1;
  for (const mark of workspace.annotations) {
    if (mark.type !== type) continue;
    const match = new RegExp("^" + prefix + "-(\\d+)$").exec(mark.label || "");
    if (match) next = Math.max(next, Number(match[1]) + 1);
  }
  return prefix + "-" + String(next).padStart(2, "0");
}

function commitMark(type, start, end) {
  const document = activeDocument();
  if (!document) return;
  const mark = {
    id: uuid(),
    documentId: document.id,
    pageNumber: document.pageNumber,
    type,
    label: nextMarkLabel(type),
    start,
    end: end || start,
    linkedCalculationId: null,
  };
  workspace.annotations.push(mark);
  selectedAnnotationId = mark.id;
  activeTool = "select";
  updateToolButtons();
  renderAnnotationPanel();
  renderDocumentList();
  renderAnnotationLayer();
  scheduleSave();
}

function setupDrawingEvents() {
  const layer = ui.annotationLayer;
  layer.addEventListener("pointerdown", (event) => {
    if (!currentViewport || !activeDocument()) return;
    if (activeTool === "select") {
      if (event.target === layer) {
        selectedAnnotationId = null;
        renderAnnotationPanel();
        renderAnnotationLayer();
      }
      return;
    }
    const type = activeTool;
    const start = screenPoint(event.clientX, event.clientY);
    if (type === "column") {
      commitMark(type, start, start);
      return;
    }
    pointerAnchor = {
      type,
      start,
      screenX: event.clientX - layer.getBoundingClientRect().left,
      screenY: event.clientY - layer.getBoundingClientRect().top,
    };
    layer.setPointerCapture(event.pointerId);
  });
  layer.addEventListener("pointermove", (event) => {
    if (!pointerAnchor) return;
    drawDraft(pointerAnchor.start, {
      screenX: event.clientX - layer.getBoundingClientRect().left,
      screenY: event.clientY - layer.getBoundingClientRect().top,
    });
  });
  const finish = (event) => {
    if (!pointerAnchor) return;
    const anchor = pointerAnchor;
    const bounds = layer.getBoundingClientRect();
    const screenEnd = { screenX: event.clientX - bounds.left, screenY: event.clientY - bounds.top };
    const distance = Math.hypot(screenEnd.screenX - anchor.screenX, screenEnd.screenY - anchor.screenY);
    if (draftElement) draftElement.remove();
    draftElement = null;
    pointerAnchor = null;
    if (distance < 3) return;
    commitMark(anchor.type, anchor.start, screenPoint(event.clientX, event.clientY));
  };
  layer.addEventListener("pointerup", finish);
  layer.addEventListener("pointercancel", () => {
    if (draftElement) draftElement.remove();
    draftElement = null;
    pointerAnchor = null;
  });
}

async function renderPage() {
  const document = activeDocument();
  if (!document) {
    currentViewport = null;
    ui.pageStage.hidden = true;
    ui.emptyViewer.hidden = false;
    ui.pageNumber.value = "1";
    ui.pageTotal.textContent = "/ 0";
    renderAnnotationPanel();
    renderDocumentList();
    return;
  }
  const requestId = ++renderCounter;
  clearViewerMessage();
  ui.emptyViewer.hidden = true;
  ui.pageStage.hidden = false;
  ui.pageNumber.value = String(document.pageNumber || 1);
  ui.pageTotal.textContent = "/ " + (document.pageCount || "…");
  ui.drawingCaption.textContent = document.name + " · Page " + (document.pageNumber || 1) + " · " + workspace.annotations.filter((mark) => mark.documentId === document.id).length + " markups";
  try {
    const pdf = await loadPdf(document);
    if (requestId !== renderCounter) return;
    const page = await pdf.getPage(document.pageNumber || 1);
    if (requestId !== renderCounter) return;
    const naturalViewport = page.getViewport({ scale: 1 });
    const availableWidth = Math.max(250, ui.viewerScroll.clientWidth - 48);
    const fitScale = Math.min(1.45, availableWidth / naturalViewport.width);
    const scale = Math.max(0.15, Math.min(3, fitScale * zoomFactor));
    const viewport = page.getViewport({ scale });
    const pixelRatio = Math.min(2, window.devicePixelRatio || 1, Math.sqrt(20000000 / Math.max(1, viewport.width * viewport.height)));
    const canvas = ui.canvas;
    canvas.width = Math.max(1, Math.floor(viewport.width * pixelRatio));
    canvas.height = Math.max(1, Math.floor(viewport.height * pixelRatio));
    canvas.style.width = viewport.width + "px";
    canvas.style.height = viewport.height + "px";
    ui.pageFrame.style.width = viewport.width + "px";
    ui.pageFrame.style.height = viewport.height + "px";
    ui.annotationLayer.style.width = viewport.width + "px";
    ui.annotationLayer.style.height = viewport.height + "px";
    currentViewport = viewport;
    renderAnnotationLayer();
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("This browser could not create a PDF canvas.");
    if (currentRenderTask) currentRenderTask.cancel();
    currentRenderTask = page.render({
      canvasContext: context,
      viewport,
      transform: pixelRatio === 1 ? null : [pixelRatio, 0, 0, pixelRatio, 0, 0],
      background: "rgb(255,255,255)",
    });
    await currentRenderTask.promise;
    if (requestId !== renderCounter) return;
    currentRenderTask = null;
    ui.pageNumber.max = String(pdf.numPages);
    ui.pageTotal.textContent = "/ " + pdf.numPages;
    ui.previousPage.disabled = document.pageNumber <= 1;
    ui.nextPage.disabled = document.pageNumber >= pdf.numPages;
    renderAnnotationPanel();
    renderDocumentList();
  } catch (error) {
    if (error && error.name === "RenderingCancelledException") return;
    if (requestId !== renderCounter) return;
    currentViewport = null;
    ui.pageStage.hidden = true;
    showViewerMessage("This PDF page could not be displayed. Check that the file is a valid, unencrypted PDF. " + safeMessage(error));
  }
}

function setTool(tool) {
  activeTool = tool;
  updateToolButtons();
  renderAnnotationLayer();
}

function updateToolButtons() {
  document.querySelectorAll(".tool-button").forEach((button) => {
    const selected = button.dataset.tool === activeTool;
    button.classList.toggle("is-active", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
  ui.annotationLayer.dataset.tool = activeTool;
  ui.toolHint.textContent = TOOL_HINTS[activeTool] || TOOL_HINTS.select;
}

function selectAnnotation(annotationId) {
  selectedAnnotationId = annotationId;
  const mark = workspace.annotations.find((item) => item.id === annotationId);
  if (mark) currentResultId = mark.linkedCalculationId || currentResultId;
  renderAnnotationPanel();
  renderAnnotationLayer();
}

function renderAnnotationPanel() {
  const visible = visibleAnnotations();
  ui.annotationCount.textContent = String(visible.length);
  ui.annotationList.replaceChildren();
  if (!visible.length) {
    const empty = document.createElement("p");
    empty.className = "list-empty";
    empty.textContent = "No markups on this page yet.";
    ui.annotationList.append(empty);
  }
  for (const mark of visible) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "annotation-row" + (mark.id === selectedAnnotationId ? " is-selected" : "");
    row.setAttribute("aria-pressed", String(mark.id === selectedAnnotationId));
    row.addEventListener("click", () => selectAnnotation(mark.id));
    const symbol = document.createElement("span");
    symbol.className = "element-symbol";
    symbol.textContent = (MARK_TYPES[mark.type] || MARK_TYPES.area).symbol;
    const info = document.createElement("span");
    info.className = "annotation-meta";
    const title = document.createElement("strong");
    title.textContent = mark.label || (MARK_TYPES[mark.type] || MARK_TYPES.area).label;
    const subtitle = document.createElement("small");
    subtitle.textContent = (MARK_TYPES[mark.type] || MARK_TYPES.area).label + " · Page " + mark.pageNumber;
    info.append(title, subtitle);
    row.append(symbol, info);
    if (mark.linkedCalculationId) {
      const dot = document.createElement("span");
      dot.className = "linked-dot";
      dot.title = "Calculation linked";
      row.append(dot);
    }
    ui.annotationList.append(row);
  }

  const selected = workspace.annotations.find((mark) => mark.id === selectedAnnotationId && visible.includes(mark));
  ui.annotationEditor.hidden = !selected;
  if (selected) {
    ui.selectedMarkupKind.textContent = (MARK_TYPES[selected.type] || MARK_TYPES.area).label;
    if (ui.annotationLabel.value !== (selected.label || "")) ui.annotationLabel.value = selected.label || "";
    ui.linkedCalculation.value = selected.linkedCalculationId || "";
  }
  renderCalculationLinkOptions();
  renderCurrentResult();
}

function renderCalculationLinkOptions() {
  const selected = workspace.annotations.find((mark) => mark.id === selectedAnnotationId);
  ui.linkedCalculation.replaceChildren();
  const empty = document.createElement("option");
  empty.value = "";
  empty.textContent = "No linked calculation";
  ui.linkedCalculation.append(empty);
  for (const record of workspace.calculations) {
    const option = document.createElement("option");
    option.value = record.id;
    const when = new Date(record.createdAt).toLocaleString();
    option.textContent = record.name + " · " + when;
    ui.linkedCalculation.append(option);
  }
  ui.linkedCalculation.disabled = !selected;
  if (selected) ui.linkedCalculation.value = selected.linkedCalculationId || "";
}

function selectedCalculation() {
  return workspace.calculations.find((record) => record.id === currentResultId) || null;
}

function renderCurrentResult() {
  const record = selectedCalculation();
  ui.calculationResult.hidden = !record;
  ui.linkResult.disabled = !record || !workspace.annotations.some((mark) => mark.id === selectedAnnotationId);
  if (!record) return;
  ui.resultTitle.textContent = record.name;
  const standard = record.standard
    ? record.standard.name + " " + record.standard.edition +
      (record.standard.clauses && record.standard.clauses.length ? " · Clause " + record.standard.clauses.join(", ") : "") +
      (record.standard.tables && record.standard.tables.length ? " · " + record.standard.tables.join(", ") : "")
    : "No standard reference";
  const runReference = record.runId ? " · EngCalcs run " + record.runId.slice(0, 8) : "";
  ui.resultStandard.textContent = standard + runReference + " · Run " + new Date(record.createdAt).toLocaleString();
  ui.resultOutput.textContent = JSON.stringify(record.outputs, null, 2);
}

function renderCalculationPicker() {
  ui.calculationPicker.replaceChildren();
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Choose a calculation";
  ui.calculationPicker.append(placeholder);
  for (const calculation of calculationCatalog) {
    const option = document.createElement("option");
    option.value = calculation.id;
    option.textContent = calculation.name;
    ui.calculationPicker.append(option);
  }
  if (activeCalculationId) ui.calculationPicker.value = activeCalculationId;
  updateCalculationDescription();
}

function inputExample(schema) {
  if (!schema || typeof schema !== "object") return null;
  if (Object.prototype.hasOwnProperty.call(schema, "const")) return schema.const;
  if (Array.isArray(schema.enum) && schema.enum.length) return schema.enum[0];
  if (Array.isArray(schema.anyOf) && schema.anyOf.length) return inputExample(schema.anyOf[0]);
  if (Array.isArray(schema.oneOf) && schema.oneOf.length) return inputExample(schema.oneOf[0]);
  if (schema.type === "object") {
    const output = {};
    const required = new Set(schema.required || []);
    for (const [key, property] of Object.entries(schema.properties || {})) {
      if (required.has(key)) output[key] = inputExample(property);
    }
    return output;
  }
  if (schema.type === "array") return [];
  if (schema.type === "boolean") return true;
  if (schema.type === "integer" || schema.type === "number") {
    if (typeof schema.minimum === "number") return schema.minimum;
    if (typeof schema.exclusiveMinimum === "number") return schema.exclusiveMinimum + 1;
    return 1;
  }
  if (schema.type === "string") return "";
  return null;
}

function updateCalculationDescription() {
  const calculation = calculationCatalog.find((item) => item.id === activeCalculationId);
  if (!calculation) {
    ui.calculationDescription.textContent = "Choose a registered EngCalcs module calculation.";
    ui.calculationSchema.textContent = "";
    ui.calculationInputs.value = "{}";
    return;
  }
  const standard = calculation.standard
    ? calculation.standard.name + " " + calculation.standard.edition
    : calculation.jurisdiction;
  ui.calculationDescription.textContent = calculation.description + " · " + standard;
  ui.calculationSchema.textContent = JSON.stringify(calculation.input_schema, null, 2);
  ui.calculationInputs.value = JSON.stringify(inputExample(calculation.input_schema) || {}, null, 2);
}

async function loadCalculationCatalog() {
  try {
    const response = await fetch("/api/calculations", { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error("Calculation catalogue returned HTTP " + response.status + ".");
    calculationCatalog = await response.json();
    renderCalculationPicker();
  } catch (error) {
    ui.calculationPicker.replaceChildren();
    const option = document.createElement("option");
    option.textContent = "Calculation library unavailable";
    ui.calculationPicker.append(option);
    ui.calculationDescription.textContent = "Could not load the EngCalcs calculation catalogue. " + safeMessage(error);
    ui.runCalculation.disabled = true;
  }
}

function showCalculationError(message) {
  ui.calculationError.textContent = message;
  ui.calculationError.hidden = false;
}

async function runSelectedCalculation() {
  ui.calculationError.hidden = true;
  const calculationId = ui.calculationPicker.value;
  if (!calculationId) {
    showCalculationError("Choose a calculation first.");
    return;
  }
  if (!ACTIVE_PROJECT_ID) {
    showCalculationError("Choose an EngCalcs project in the workspace header to save this calculation run.");
    return;
  }
  let inputs;
  try {
    inputs = JSON.parse(ui.calculationInputs.value);
    if (!inputs || Array.isArray(inputs) || typeof inputs !== "object") throw new Error("Inputs must be a JSON object.");
  } catch (error) {
    showCalculationError("Calculation inputs are not valid JSON. " + safeMessage(error));
    return;
  }
  ui.runCalculation.disabled = true;
  ui.runCalculation.textContent = "Calculating…";
  try {
    const definition = calculationCatalog.find((item) => item.id === calculationId) || {};
    const selected = workspace.annotations.find((mark) => mark.id === selectedAnnotationId);
    const calculationTitle = [workspace.name, selected && selected.label, definition.name]
      .filter(Boolean)
      .join(" · ");
    const response = await fetch("/api/calculations/" + encodeURIComponent(calculationId) + "/run", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ projectId: ACTIVE_PROJECT_ID, title: calculationTitle, inputs }),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "Calculation was rejected (HTTP " + response.status + ").");
    const record = {
      id: uuid(),
      calculationId,
      name: definition.name || body.definition && body.definition.name || calculationId,
      version: definition.version || body.definition && body.definition.version || "1",
      standard: definition.standard || body.definition && body.definition.standard || null,
      inputs,
      outputs: body.result !== undefined ? body.result : body.outputs !== undefined ? body.outputs : body,
      createdAt: body.createdAt || new Date().toISOString(),
      runId: body.runId || null,
      opencalcsCalculationId: body.calculationId || null,
      projectId: ACTIVE_PROJECT_ID,
    };
    workspace.calculations.unshift(record);
    currentResultId = record.id;
    if (selected) selected.linkedCalculationId = record.id;
    renderAnnotationPanel();
    renderDocumentList();
    scheduleSave();
  } catch (error) {
    showCalculationError(safeMessage(error));
  } finally {
    ui.runCalculation.disabled = false;
    ui.runCalculation.textContent = "Run calculation";
  }
}

async function addPdfFiles(files) {
  const incoming = Array.from(files || []);
  if (!incoming.length) return;
  if (workspace.documents.length + incoming.length > MAX_DOCUMENTS) {
    showViewerMessage("A drawing set can contain up to " + MAX_DOCUMENTS + " PDFs.");
    return;
  }
  let totalBytes = workspace.documents.reduce((sum, item) => sum + (item.blob ? item.blob.size : 0), 0);
  for (const file of incoming) {
    if (file.size > MAX_DOCUMENT_BYTES) {
      showViewerMessage(file.name + " is larger than the 50 MB per-file limit.");
      continue;
    }
    if (totalBytes + file.size > MAX_TOTAL_BYTES) {
      showViewerMessage("This drawing set is limited to 100 MB in total.");
      break;
    }
    try {
      const header = new Uint8Array(await file.slice(0, 1024).arrayBuffer());
      const signature = Array.from(header).map((byte) => String.fromCharCode(byte)).join("");
      if (!signature.includes("%PDF-")) {
        showViewerMessage(file.name + " is not a PDF file.");
        continue;
      }
      const candidate = {
        id: uuid(),
        name: file.name.slice(0, 180),
        blob: new Blob([file], { type: "application/pdf" }),
        pageCount: 0,
        pageNumber: 1,
      };
      const pdf = await loadPdf(candidate);
      await pdf.getPage(1);
      workspace.documents.push(candidate);
      totalBytes += file.size;
      if (!workspace.activeDocumentId) workspace.activeDocumentId = candidate.id;
      clearViewerMessage();
    } catch (error) {
      showViewerMessage(file.name + " could not be opened. Encrypted or damaged PDFs are not supported. " + safeMessage(error));
    }
  }
  ui.fileInput.value = "";
  renderDocumentList();
  if (workspace.activeDocumentId) await selectDocument(workspace.activeDocumentId);
  scheduleSave();
}

async function removeDocument(documentId) {
  const item = workspace.documents.find((document) => document.id === documentId);
  if (!item) return;
  if (!window.confirm("Remove " + item.name + " and its page markups from this browser workspace?")) return;
  const pdf = loadedDocuments.get(documentId);
  if (pdf) {
    await pdf.destroy();
    loadedDocuments.delete(documentId);
  }
  workspace.documents = workspace.documents.filter((document) => document.id !== documentId);
  const removedMarks = new Set(workspace.annotations.filter((mark) => mark.documentId === documentId).map((mark) => mark.id));
  workspace.annotations = workspace.annotations.filter((mark) => mark.documentId !== documentId);
  for (const record of workspace.calculations) {
    if (record.annotationId && removedMarks.has(record.annotationId)) delete record.annotationId;
  }
  if (workspace.activeDocumentId === documentId) {
    workspace.activeDocumentId = workspace.documents[0] ? workspace.documents[0].id : null;
    selectedAnnotationId = null;
    currentViewport = null;
    if (workspace.activeDocumentId) workspace.documents[0].pageNumber = 1;
  }
  renderDocumentList();
  renderAnnotationPanel();
  await renderPage();
  scheduleSave();
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function safeFilename(value) {
  return (value || "drawing").replace(/[<>:"\\|?*\x00-\x1f]/g, "-").replaceAll("/", "-").replace(/\s+/g, "-").slice(0, 100);
}

function exportSidecar(document, annotations) {
  const calculationIds = new Set(annotations.map((mark) => mark.linkedCalculationId).filter(Boolean));
  return {
    schema_version: 1,
    opencalcs_project_id: ACTIVE_PROJECT_ID || null,
    drawing_set: workspace.name,
    drawing: { filename: document.name, page_count: document.pageCount },
    exported_at: new Date().toISOString(),
    annotations,
    calculations: workspace.calculations.filter((record) => calculationIds.has(record.id)),
    note: "Drawing markups link to saved EngCalcs calculation runs. This export does not represent beam, column, connection, or member-capacity verification.",
  };
}

function asciiLabel(value) {
  return String(value || "").replace(/[^\x20-\x7e]/g, "?").slice(0, 80);
}

async function exportMarkedPdf() {
  const document = activeDocument();
  if (!document) return;
  ui.exportPdf.disabled = true;
  ui.exportPdf.textContent = "Preparing PDF…";
  try {
    const { PDFDocument, StandardFonts, rgb } = await loadPdfLib();
    const bytes = await document.blob.arrayBuffer();
    const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
    const regular = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const marks = workspace.annotations.filter((mark) => mark.documentId === document.id);
    for (const mark of marks) {
      const page = pdf.getPage(mark.pageNumber - 1);
      if (!page) continue;
      const definition = MARK_TYPES[mark.type] || MARK_TYPES.area;
      const hex = definition.color.slice(1);
      const color = rgb(parseInt(hex.slice(0, 2), 16) / 255, parseInt(hex.slice(2, 4), 16) / 255, parseInt(hex.slice(4, 6), 16) / 255);
      if (mark.type === "beam") {
        page.drawLine({
          start: mark.start,
          end: mark.end,
          thickness: 2.4,
          color,
          opacity: 0.95,
        });
      } else if (mark.type === "column") {
        page.drawCircle({ x: mark.start.x, y: mark.start.y, size: 7, borderColor: color, borderWidth: 2, color: rgb(1, 1, 1), opacity: 0.55 });
        page.drawLine({ start: { x: mark.start.x - 4, y: mark.start.y }, end: { x: mark.start.x + 4, y: mark.start.y }, thickness: 1.5, color });
        page.drawLine({ start: { x: mark.start.x, y: mark.start.y - 4 }, end: { x: mark.start.x, y: mark.start.y + 4 }, thickness: 1.5, color });
      } else {
        page.drawRectangle({
          x: Math.min(mark.start.x, mark.end.x),
          y: Math.min(mark.start.y, mark.end.y),
          width: Math.max(1, Math.abs(mark.end.x - mark.start.x)),
          height: Math.max(1, Math.abs(mark.end.y - mark.start.y)),
          borderColor: color,
          borderWidth: 2,
          color: rgb(1, 1, 1),
          opacity: 0.12,
        });
      }
      const label = asciiLabel(mark.label);
      if (label) {
        const textSize = 9;
        const width = bold.widthOfTextAtSize(label, textSize);
        const x = mark.type === "column"
          ? mark.start.x + 10
          : Math.min(mark.start.x, mark.end.x) + 3;
        let y = mark.type === "column"
          ? mark.start.y + 10
          : Math.max(mark.start.y, mark.end.y) + 4;
        y = y > page.getHeight() - 14 ? Math.min(mark.start.y, mark.end.y) - 12 : y;
        const textX = clamp(x, 2, Math.max(2, page.getWidth() - width - 2));
        const textY = clamp(y, 2, Math.max(2, page.getHeight() - 12));
        page.drawRectangle({ x: textX - 2, y: textY - 2, width: width + 4, height: 13, color: rgb(0.05, 0.08, 0.06), opacity: 0.78 });
        page.drawText(label, { x: textX, y: textY, size: textSize, font: bold || regular, color: rgb(1, 1, 1) });
      }
    }
    const metadata = new TextEncoder().encode(JSON.stringify(exportSidecar(document, marks), null, 2));
    await pdf.attach(metadata, safeFilename(document.name.replace(/\.pdf$/i, "") + ".opencalcs-annotations.json"), {
      mimeType: "application/json",
      description: "EngCalcs drawing markup with linked calculation run snapshots.",
    });
    const output = await pdf.save();
    const url = URL.createObjectURL(new Blob([output], { type: "application/pdf" }));
    const anchor = window.document.createElement("a");
    anchor.href = url;
    anchor.download = safeFilename(document.name.replace(/\.pdf$/i, "")) + ".marked.pdf";
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    setSaveStatus("Marked PDF exported", "saved");
  } catch (error) {
    showViewerMessage("Could not export this PDF. It may be encrypted or use a PDF feature the browser exporter cannot preserve. " + safeMessage(error));
  } finally {
    ui.exportPdf.disabled = !activeDocument();
    ui.exportPdf.textContent = "Export marked PDF";
  }
}

function loadPdfLib() {
  if (window.PDFLib?.PDFDocument) return Promise.resolve(window.PDFLib);
  if (!pdfLibPromise) {
    pdfLibPromise = new Promise((resolve, reject) => {
      const script = window.document.createElement("script");
      script.src = "/vendor/pdf-lib/pdf-lib.min.js";
      script.async = true;
      script.onload = () => {
        if (window.PDFLib?.PDFDocument) resolve(window.PDFLib);
        else reject(new Error("The PDF export helper did not initialize."));
      };
      script.onerror = () => reject(new Error("The PDF export helper could not be downloaded."));
      window.document.head.append(script);
    }).catch((error) => {
      pdfLibPromise = null;
      throw error;
    });
  }
  return pdfLibPromise;
}

function bindEvents() {
  ui.fileInput.addEventListener("change", () => addPdfFiles(ui.fileInput.files));
  ui.dropzone.addEventListener("dragover", (event) => {
    event.preventDefault();
    ui.dropzone.classList.add("is-dragging");
  });
  ui.dropzone.addEventListener("dragleave", () => ui.dropzone.classList.remove("is-dragging"));
  ui.dropzone.addEventListener("drop", (event) => {
    event.preventDefault();
    ui.dropzone.classList.remove("is-dragging");
    addPdfFiles(event.dataTransfer.files);
  });
  ui.activeDocument.addEventListener("change", () => selectDocument(ui.activeDocument.value));
  ui.previousPage.addEventListener("click", async () => {
    const document = activeDocument();
    if (!document || document.pageNumber <= 1) return;
    document.pageNumber -= 1;
    selectedAnnotationId = null;
    renderAnnotationPanel();
    await renderPage();
    scheduleSave();
  });
  ui.nextPage.addEventListener("click", async () => {
    const document = activeDocument();
    if (!document || document.pageNumber >= document.pageCount) return;
    document.pageNumber += 1;
    selectedAnnotationId = null;
    renderAnnotationPanel();
    await renderPage();
    scheduleSave();
  });
  ui.pageNumber.addEventListener("change", async () => {
    const document = activeDocument();
    if (!document) return;
    document.pageNumber = clamp(Number(ui.pageNumber.value) || 1, 1, document.pageCount);
    selectedAnnotationId = null;
    renderAnnotationPanel();
    await renderPage();
    scheduleSave();
  });
  ui.zoomIn.addEventListener("click", async () => { zoomFactor = Math.min(3, zoomFactor * 1.2); await renderPage(); });
  ui.zoomOut.addEventListener("click", async () => { zoomFactor = Math.max(0.25, zoomFactor / 1.2); await renderPage(); });
  ui.zoomFit.addEventListener("click", async () => { zoomFactor = 1; await renderPage(); });
  document.querySelectorAll(".tool-button").forEach((button) => button.addEventListener("click", () => setTool(button.dataset.tool)));
  ui.projectName.addEventListener("input", updateWorkspaceTitle);
  ui.annotationLabel.addEventListener("input", () => {
    const selected = workspace.annotations.find((mark) => mark.id === selectedAnnotationId);
    if (!selected) return;
    selected.label = ui.annotationLabel.value.slice(0, 80);
    renderAnnotationPanel();
    renderAnnotationLayer();
    renderDocumentList();
    scheduleSave();
  });
  ui.linkedCalculation.addEventListener("change", () => {
    const selected = workspace.annotations.find((mark) => mark.id === selectedAnnotationId);
    if (!selected) return;
    selected.linkedCalculationId = ui.linkedCalculation.value || null;
    if (selected.linkedCalculationId) currentResultId = selected.linkedCalculationId;
    renderAnnotationPanel();
    renderAnnotationLayer();
    scheduleSave();
  });
  ui.deleteAnnotation.addEventListener("click", () => {
    workspace.annotations = workspace.annotations.filter((mark) => mark.id !== selectedAnnotationId);
    selectedAnnotationId = null;
    renderAnnotationPanel();
    renderAnnotationLayer();
    renderDocumentList();
    scheduleSave();
  });
  ui.calculationPicker.addEventListener("change", () => {
    activeCalculationId = ui.calculationPicker.value;
    updateCalculationDescription();
  });
  ui.showSchema.addEventListener("click", () => {
    ui.schemaPanel.hidden = !ui.schemaPanel.hidden;
    ui.showSchema.textContent = ui.schemaPanel.hidden ? "Input schema" : "Hide schema";
  });
  ui.runCalculation.addEventListener("click", runSelectedCalculation);
  ui.linkResult.addEventListener("click", () => {
    const selected = workspace.annotations.find((mark) => mark.id === selectedAnnotationId);
    const record = selectedCalculation();
    if (!selected || !record) return;
    selected.linkedCalculationId = record.id;
    renderAnnotationPanel();
    renderAnnotationLayer();
    scheduleSave();
  });
  ui.exportPdf.addEventListener("click", exportMarkedPdf);
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { if (activeDocument()) renderPage(); }, 120);
  });
}

async function start() {
  bindEvents();
  setupDrawingEvents();
  updateToolButtons();
  try {
    database = await openDatabase();
    const saved = await readWorkspace();
    if (saved && Array.isArray(saved.documents) && Array.isArray(saved.annotations) && Array.isArray(saved.calculations)) {
      workspace = saved;
    }
    setSaveStatus("Saved in this browser", "saved");
  } catch (error) {
    setSaveStatus("Session only", "error");
    showViewerMessage("Local drawing persistence is unavailable in this browser. Work can continue in this tab, but export the marked PDF before closing it. " + safeMessage(error));
  }
  ui.projectName.value = workspace.name || "Untitled drawing set";
  renderDocumentList();
  renderAnnotationPanel();
  await loadCalculationCatalog();
  if (workspace.activeDocumentId && workspace.documents.some((item) => item.id === workspace.activeDocumentId)) {
    await renderPage();
  } else if (workspace.documents.length) {
    workspace.activeDocumentId = workspace.documents[0].id;
    await selectDocument(workspace.activeDocumentId);
  }
}

start().catch((error) => {
  setSaveStatus("Workspace unavailable", "error");
  showViewerMessage("The drawing review workspace could not start. " + safeMessage(error));
});
