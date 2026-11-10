// 이미지 선택, 재료 검토, 확정 기능의 브라우저 동작을 관리합니다.
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const INGREDIENTS_STORAGE_KEY = "fridge-confirmed-ingredients";
const CONFIDENCE_LABELS = {
  high: "인식 선명",
  medium: "확인 권장",
  low: "확인 필요"
};

const cameraInput = document.querySelector("#camera-input");
const fileInput = document.querySelector("#file-input");
const dropArea = document.querySelector("#drop-area");
const uploadEmpty = document.querySelector("#upload-empty");
const previewWrap = document.querySelector("#preview-wrap");
const imagePreview = document.querySelector("#image-preview");
const fileName = document.querySelector("#file-name");
const analyzeButton = document.querySelector("#analyze-button");
const analyzeLabel = document.querySelector("#analyze-label");
const uploadMessage = document.querySelector("#upload-message");
const resultCard = document.querySelector("#result-card");
const resultMessage = document.querySelector("#result-message");
const ingredientList = document.querySelector("#ingredient-list");
const addIngredientForm = document.querySelector("#add-ingredient-form");
const newIngredientInput = document.querySelector("#new-ingredient");
const ingredientCount = document.querySelector("#ingredient-count");
const confirmButton = document.querySelector("#confirm-button");
const confirmMessage = document.querySelector("#confirm-message");
const recipeCard = document.querySelector("#recipe-card");
const recipeForm = document.querySelector("#recipe-form");
const recipeIngredientChips = document.querySelector("#recipe-ingredient-chips");
const recipeMessage = document.querySelector("#recipe-message");
const recipeResults = document.querySelector("#recipe-results");
const generateRecipesButton = document.querySelector("#generate-recipes-button");
const generateRecipesLabel = document.querySelector("#generate-recipes-label");
const accountDialog = document.querySelector("#account-dialog");
const accountButton = document.querySelector("#account-button");
const accountMessage = document.querySelector("#account-message");
const accountPanels = {
  login: document.querySelector("#login-panel"),
  signup: document.querySelector("#signup-panel"),
  recovery: document.querySelector("#recovery-panel"),
  newPassword: document.querySelector("#new-password-panel"),
  profile: document.querySelector("#profile-panel")
};
const savedRecipeList = document.querySelector("#saved-recipe-list");
const savedCount = document.querySelector("#saved-count");
const savedEmpty = document.querySelector("#saved-empty");

let selectedFile = null;
let previewUrl = null;
let ingredients = [];
let isAnalyzing = false;
let isIngredientsConfirmed = false;
let isGeneratingRecipes = false;
let currentUser = null;
let currentProfile = null;
let savedRecipes = [];
let recoveryAccessToken = null;

// 업로드 버튼과 파일 입력 변경을 한 파일 검증 흐름으로 연결합니다.
document.querySelector("#camera-button").addEventListener("click", () => cameraInput.click());
document.querySelector("#choose-button").addEventListener("click", () => fileInput.click());
cameraInput.addEventListener("change", (event) => {
  handleFileSelection(event.target.files[0]);
  event.target.value = "";
});
fileInput.addEventListener("change", (event) => {
  handleFileSelection(event.target.files[0]);
  event.target.value = "";
});
document.querySelector("#remove-image").addEventListener("click", clearSelectedImage);
analyzeButton.addEventListener("click", analyzeImage);
addIngredientForm.addEventListener("submit", addIngredient);
confirmButton.addEventListener("click", confirmIngredients);
recipeForm.addEventListener("submit", generateRecipes);
document.querySelector("#edit-ingredients-button").addEventListener("click", () => {
  resultCard.scrollIntoView({ behavior: "smooth", block: "start" });
});
accountButton.addEventListener("click", openAccountDialog);
document.querySelector("#close-account-dialog").addEventListener("click", () => accountDialog.close());
accountDialog.addEventListener("click", (event) => {
  if (event.target === accountDialog) {
    accountDialog.close();
  }
});
document.querySelector("#show-signup").addEventListener("click", () => showAccountPanel("signup"));
document.querySelector("#show-recovery").addEventListener("click", () => showAccountPanel("recovery"));
document.querySelector("#show-login-from-signup").addEventListener("click", () => showAccountPanel("login"));
document.querySelector("#show-login-from-recovery").addEventListener("click", () => showAccountPanel("login"));
document.querySelector("#login-form").addEventListener("submit", signInAccount);
document.querySelector("#signup-form").addEventListener("submit", signUpAccount);
document.querySelector("#recovery-form").addEventListener("submit", requestPasswordReset);
document.querySelector("#new-password-form").addEventListener("submit", setNewPassword);
document.querySelector("#profile-form").addEventListener("submit", saveProfile);
document.querySelector("#logout-button").addEventListener("click", signOutAccount);
document.querySelector("#delete-account-button").addEventListener("click", deleteAccount);

// 드래그 앤 드롭을 지원하되 브라우저가 파일을 열지 않도록 기본 동작을 막습니다.
dropArea.addEventListener("dragover", (event) => {
  event.preventDefault();
  dropArea.classList.add("is-dragging");
});
dropArea.addEventListener("dragleave", (event) => {
  if (!dropArea.contains(event.relatedTarget)) {
    dropArea.classList.remove("is-dragging");
  }
});
dropArea.addEventListener("drop", (event) => {
  event.preventDefault();
  dropArea.classList.remove("is-dragging");
  handleFileSelection(event.dataTransfer.files[0]);
});

// 새로고침한 경우에도 사용자가 마지막으로 확정한 재료를 다음 단계에 연결합니다.
restoreConfirmedIngredients();
initializeAccount();
handlePasswordRecoveryLink();

// 유효한 이미지 한 장만 미리보기와 분석 요청에 사용합니다.
function handleFileSelection(file) {
  uploadMessage.textContent = "";
  confirmMessage.textContent = "";

  if (!file) {
    return;
  }

  if (!ACCEPTED_IMAGE_TYPES.has(file.type)) {
    uploadMessage.textContent = "JPG, PNG, WebP 형식의 이미지만 사용할 수 있어요.";
    return;
  }

  if (file.size > MAX_IMAGE_BYTES) {
    uploadMessage.textContent = "사진은 3MB 이하로 선택해 주세요.";
    return;
  }

  releasePreviewUrl();
  selectedFile = file;
  previewUrl = URL.createObjectURL(file);
  imagePreview.src = previewUrl;
  fileName.textContent = file.name;
  uploadEmpty.hidden = true;
  previewWrap.hidden = false;
  analyzeButton.disabled = false;
}

// 사진을 지울 때 미리보기 객체 URL도 해제해 브라우저 메모리를 정리합니다.
function clearSelectedImage() {
  selectedFile = null;
  releasePreviewUrl();
  imagePreview.removeAttribute("src");
  fileName.textContent = "";
  previewWrap.hidden = true;
  uploadEmpty.hidden = false;
  analyzeButton.disabled = true;
  uploadMessage.textContent = "";
  cameraInput.value = "";
  fileInput.value = "";
}

// 이전 미리보기 URL을 해제하고 객체 참조를 초기화합니다.
function releasePreviewUrl() {
  if (previewUrl) {
    URL.revokeObjectURL(previewUrl);
    previewUrl = null;
  }
}

// 선택한 이미지 데이터를 서버리스 함수에 보내고 검증된 재료만 화면에 표시합니다.
async function analyzeImage() {
  if (!selectedFile || isAnalyzing) {
    return;
  }

  isAnalyzing = true;
  analyzeButton.disabled = true;
  analyzeLabel.textContent = "재료를 살펴보는 중...";
  uploadMessage.textContent = "";
  confirmMessage.textContent = "";

  try {
    const image = await readFileAsDataUrl(selectedFile);
    const response = await fetch("/api/recognize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image })
    });
    const payload = await readJsonResponse(response);

    if (!response.ok) {
      throw new Error(getApiErrorMessage(payload.error?.code));
    }

    if (!Array.isArray(payload.ingredients)) {
      throw new Error("인식 결과의 형식이 올바르지 않아요. 다시 시도해 주세요.");
    }

    invalidateIngredientConfirmation();
    ingredients = payload.ingredients
      .filter((item) => item && typeof item.name === "string")
      .map((item) => ({
        name: item.name.trim(),
        confidence: CONFIDENCE_LABELS[item.confidence] ? item.confidence : "medium"
      }))
      .filter((item) => item.name.length > 0);

    resultMessage.textContent = ingredients.length
      ? "AI가 찾은 재료예요. 이름과 확인 표시를 살펴보고 필요한 내용을 수정해 주세요."
      : "사진에서 재료를 찾지 못했어요. 사진을 바꾸거나 아래에서 재료를 직접 입력해 주세요.";
    resultCard.hidden = false;
    renderIngredients();
    resultCard.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    uploadMessage.textContent = error instanceof Error
      ? error.message
      : "재료를 인식하지 못했어요. 네트워크를 확인하고 다시 시도해 주세요.";
  } finally {
    isAnalyzing = false;
    analyzeButton.disabled = !selectedFile;
    analyzeLabel.textContent = "재료 찾아보기";
  }
}

// FileReader의 완료·실패를 Promise로 전달해 분석 요청 흐름에서 처리합니다.
function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("사진을 읽지 못했어요. 다른 파일을 선택해 주세요."));
      }
    });
    reader.addEventListener("error", () => {
      reject(new Error("사진을 읽지 못했어요. 다른 파일을 선택해 주세요."));
    });
    reader.readAsDataURL(file);
  });
}

// 서버 응답이 JSON이 아닐 때도 정상 결과처럼 취급하지 않습니다.
async function readJsonResponse(response) {
  try {
    return await response.json();
  } catch {
    throw new Error("서버 응답을 확인하지 못했어요. 잠시 후 다시 시도해 주세요.");
  }
}

// 서버 오류 코드를 사진·인증·호출 제한·모델 문제에 맞는 안내로 바꿉니다.
function getApiErrorMessage(code) {
  const messages = {
    invalid_image: "지원하지 않는 사진 형식이거나 파일이 너무 커요. JPG, PNG, WebP 3MB 이하로 선택해 주세요.",
    missing_api_key: "서버에 OpenRouter API 키가 설정되지 않았어요. 운영자에게 문의해 주세요.",
    rate_limited: "요청이 잠시 많아요. 조금 기다린 뒤 다시 시도해 주세요.",
    timeout: "재료 인식 시간이 초과됐어요. 네트워크를 확인하고 다시 시도해 주세요.",
    invalid_model_response: "AI 응답을 재료 목록으로 읽지 못했어요. 사진을 확인하고 다시 시도해 주세요.",
    upstream_error: "AI 재료 인식 서비스에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.",
    invalid_request: "사진 요청을 처리할 수 없어요. 사진을 다시 선택해 주세요."
  };
  return messages[code] || "재료를 인식하지 못했어요. 네트워크를 확인하고 다시 시도해 주세요.";
}

// 모델 응답과 직접 입력 재료를 텍스트 노드로 그려 HTML 삽입을 방지합니다.
function renderIngredients() {
  ingredientList.replaceChildren();

  if (ingredients.length === 0) {
    const emptyItem = document.createElement("li");
    emptyItem.className = "empty-result";
    emptyItem.textContent = "아직 등록된 재료가 없어요. 재료를 직접 입력해 추가할 수 있어요.";
    ingredientList.append(emptyItem);
  } else {
    ingredients.forEach((ingredient, index) => {
      const item = document.createElement("li");
      item.className = "ingredient-item";

      const input = document.createElement("input");
      input.className = "ingredient-input";
      input.type = "text";
      input.maxLength = 80;
      input.value = ingredient.name;
      input.setAttribute("aria-label", `${index + 1}번째 재료 이름`);
      input.addEventListener("input", () => {
        invalidateIngredientConfirmation();
        ingredients[index].name = input.value;
        updateIngredientCount();
      });

      const confidence = document.createElement("span");
      confidence.className = ingredient.confidence === "low"
        ? "confidence confidence-low"
        : "confidence";
      confidence.textContent = CONFIDENCE_LABELS[ingredient.confidence] || CONFIDENCE_LABELS.medium;

      const removeButton = document.createElement("button");
      removeButton.className = "remove-ingredient";
      removeButton.type = "button";
      removeButton.textContent = "×";
      removeButton.setAttribute("aria-label", `${ingredient.name} 삭제`);
      removeButton.addEventListener("click", () => {
        invalidateIngredientConfirmation();
        ingredients.splice(index, 1);
        renderIngredients();
      });

      item.append(input, confidence, removeButton);
      ingredientList.append(item);
    });
  }

  updateIngredientCount();
}

// 이름이 비어 있지 않은 재료만 개수로 세고 확정 버튼 상태를 갱신합니다.
function updateIngredientCount() {
  const validCount = ingredients.filter((ingredient) => ingredient.name.trim()).length;
  ingredientCount.textContent = `재료 ${validCount}개`;
  confirmButton.disabled = validCount === 0;
}

// 사용자가 직접 입력한 재료를 목록 끝에 추가합니다.
function addIngredient(event) {
  event.preventDefault();
  const name = newIngredientInput.value.trim();

  if (!name) {
    newIngredientInput.focus();
    return;
  }

  if (ingredients.some((ingredient) => ingredient.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase())) {
    resultMessage.textContent = "이미 목록에 있는 재료예요.";
    newIngredientInput.focus();
    return;
  }

  invalidateIngredientConfirmation();
  ingredients.push({ name, confidence: "high" });
  newIngredientInput.value = "";
  resultMessage.textContent = "재료를 추가했어요. 목록을 확인해 주세요.";
  renderIngredients();
}

// 확정된 목록을 브라우저에 저장해 다음 단계에서도 다시 사용할 수 있게 합니다.
function confirmIngredients() {
  const confirmedIngredients = ingredients
    .map((ingredient) => ingredient.name.trim())
    .filter(Boolean);

  if (confirmedIngredients.length === 0) {
    confirmMessage.textContent = "확정할 재료를 하나 이상 추가해 주세요.";
    return;
  }

  const confirmedAt = new Date().toISOString();
  const confirmation = { ingredients: confirmedIngredients, confirmedAt };

  try {
    localStorage.setItem(INGREDIENTS_STORAGE_KEY, JSON.stringify(confirmation));
  } catch {
    confirmMessage.textContent = "브라우저에 재료 목록을 저장하지 못했어요. 저장 공간을 확인해 주세요.";
    return;
  }

  isIngredientsConfirmed = true;
  confirmMessage.textContent = `재료 ${confirmedIngredients.length}개를 확정했어요. 다음 단계에서 사용할 수 있어요.`;
  showRecipeBuilder(confirmation.ingredients);
  window.dispatchEvent(new CustomEvent("ingredientsConfirmed", { detail: confirmation }));
}

// 브라우저에 남아 있는 확정 목록을 검사해 재료 검토 화면을 복원합니다.
function restoreConfirmedIngredients() {
  let savedValue;

  try {
    savedValue = localStorage.getItem(INGREDIENTS_STORAGE_KEY);
  } catch {
    confirmMessage.textContent = "저장된 재료 목록을 읽지 못했어요. 브라우저 저장 설정을 확인해 주세요.";
    return;
  }

  if (!savedValue) {
    return;
  }

  let savedConfirmation;
  try {
    savedConfirmation = JSON.parse(savedValue);
  } catch {
    confirmMessage.textContent = "저장된 재료 목록을 읽지 못했어요. 재료를 다시 확정해 주세요.";
    return;
  }

  if (
    !savedConfirmation ||
    !Array.isArray(savedConfirmation.ingredients) ||
    savedConfirmation.ingredients.length === 0 ||
    savedConfirmation.ingredients.some((name) => typeof name !== "string" || !name.trim() || name.trim().length > 80)
  ) {
    confirmMessage.textContent = "저장된 재료 목록이 올바르지 않아요. 재료를 다시 확정해 주세요.";
    return;
  }

  ingredients = savedConfirmation.ingredients.map((name) => ({ name: name.trim(), confidence: "medium" }));
  isIngredientsConfirmed = true;
  resultCard.hidden = false;
  resultMessage.textContent = "이전에 확정한 재료예요. 수정이 필요하면 목록을 고친 뒤 다시 확정해 주세요.";
  renderIngredients();
  showRecipeBuilder(savedConfirmation.ingredients);
}

// 확정된 재료가 바뀌면 이전 목록과 연결된 레시피를 숨겨 잘못된 입력을 막습니다.
function invalidateIngredientConfirmation() {
  if (!isIngredientsConfirmed) {
    return;
  }

  isIngredientsConfirmed = false;
  recipeCard.hidden = true;
  recipeResults.replaceChildren();
  recipeMessage.textContent = "";
  confirmMessage.textContent = "재료가 변경됐어요. 다시 확정하면 레시피를 만들 수 있어요.";

  try {
    localStorage.removeItem(INGREDIENTS_STORAGE_KEY);
  } catch {
    confirmMessage.textContent = "변경된 재료 목록을 저장하지 못했어요. 브라우저 저장 설정을 확인해 주세요.";
  }
}

// 확정 목록을 레시피 생성 화면에 보여 줍니다.
function showRecipeBuilder(confirmedIngredients) {
  recipeIngredientChips.replaceChildren();
  confirmedIngredients.forEach((name) => {
    const chip = document.createElement("span");
    chip.className = "ingredient-chip";
    chip.textContent = name;
    recipeIngredientChips.append(chip);
  });
  recipeCard.hidden = false;
}

// 확정 재료와 현재 선택한 조건으로 레시피를 요청합니다.
async function generateRecipes(event) {
  event.preventDefault();

  if (isGeneratingRecipes) {
    return;
  }

  if (!isIngredientsConfirmed) {
    recipeMessage.textContent = "재료 목록을 먼저 확인하고 확정해 주세요.";
    resultCard.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }

  let savedConfirmation;
  try {
    savedConfirmation = JSON.parse(localStorage.getItem(INGREDIENTS_STORAGE_KEY) || "null");
  } catch {
    recipeMessage.textContent = "확정된 재료를 읽지 못했어요. 재료를 다시 확정해 주세요.";
    return;
  }

  if (!savedConfirmation || !Array.isArray(savedConfirmation.ingredients) || !savedConfirmation.ingredients.length) {
    recipeMessage.textContent = "확정된 재료가 없어요. 재료 목록을 다시 확인해 주세요.";
    return;
  }

  const maxCookingTimeValue = document.querySelector("#max-cooking-time").value;
  const requestBody = {
    ingredients: savedConfirmation.ingredients,
    servings: Number(document.querySelector("#servings").value),
    maxCookingTime: maxCookingTimeValue ? Number(maxCookingTimeValue) : null,
    diet: document.querySelector("#diet-preference").value.trim(),
    allergies: document.querySelector("#allergy-notes").value.trim()
  };

  isGeneratingRecipes = true;
  generateRecipesButton.disabled = true;
  generateRecipesLabel.textContent = "레시피를 만드는 중...";
  recipeMessage.textContent = "확정한 재료에 맞는 레시피를 찾고 있어요.";

  try {
    const response = await fetch("/api/recipes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody)
    });
    const payload = await readJsonResponse(response);

    if (!response.ok) {
      throw new Error(getRecipeApiErrorMessage(payload.error?.code));
    }

    if (!Array.isArray(payload.recipes) || payload.recipes.length === 0 || payload.recipes.length > 3) {
      throw new Error("레시피 응답 형식이 올바르지 않아요. 다시 시도해 주세요.");
    }

    renderRecipes(payload.recipes);
    recipeMessage.textContent = `${payload.recipes.length}개의 레시피를 준비했어요. 재료와 조리 순서를 확인해 주세요.`;
  } catch (error) {
    recipeMessage.textContent = error instanceof Error
      ? error.message
      : "레시피를 만들지 못했어요. 네트워크를 확인하고 다시 시도해 주세요.";
  } finally {
    isGeneratingRecipes = false;
    generateRecipesButton.disabled = false;
    generateRecipesLabel.textContent = "레시피 추천받기";
  }
}

// API 오류를 인증·제한·시간 초과 등 사용자가 이해할 수 있는 안내로 바꿉니다.
function getRecipeApiErrorMessage(code) {
  const messages = {
    invalid_request: "레시피 조건을 확인할 수 없어요. 재료를 다시 확정해 주세요.",
    missing_ingredients: "확정된 재료가 없어요. 재료 목록으로 돌아가 먼저 확정해 주세요.",
    missing_api_key: "서버에 OpenRouter API 키가 설정되지 않았어요. 운영자에게 문의해 주세요.",
    rate_limited: "요청이 잠시 많아요. 조금 기다린 뒤 다시 시도해 주세요.",
    timeout: "레시피 생성 시간이 초과됐어요. 잠시 후 다시 시도해 주세요.",
    invalid_model_response: "AI 응답을 레시피로 읽지 못했어요. 조건을 확인하고 다시 시도해 주세요.",
    upstream_error: "레시피 생성 서비스에 연결하지 못했어요. 잠시 후 다시 시도해 주세요."
  };
  return messages[code] || "레시피를 만들지 못했어요. 네트워크를 확인하고 다시 시도해 주세요.";
}

// 레시피 내용은 텍스트 노드로만 표시해 모델 응답이 HTML로 실행되지 않게 합니다.
function renderRecipes(recipes) {
  recipeResults.replaceChildren();

  recipes.forEach((recipe) => {
    const card = createRecipeCard(recipe, true);
    recipeResults.append(card);
  });
}

// 새 레시피와 저장 레시피가 같은 안전한 카드 표현을 재사용합니다.
function createRecipeCard(recipe, includeSaveButton) {
  const card = document.createElement("article");
  card.className = "recipe-item";

  const title = createTextElement("h3", recipe.title);
  const description = createTextElement("p", recipe.description);
  description.className = "recipe-description";

  const meta = document.createElement("div");
  meta.className = "recipe-meta";
  meta.append(
    createTextElement("span", `약 ${recipe.cookingTimeMinutes}분`),
    createTextElement("span", `${recipe.servings}인분`)
  );

  const detailGrid = document.createElement("div");
  detailGrid.className = "recipe-detail-grid";
  detailGrid.append(
    createRecipeIngredientSection("냉장고 재료", recipe.availableIngredients, (name) => name),
    createRecipeIngredientSection("추가로 필요한 재료", recipe.additionalIngredients, (item) => `${item.name} · ${item.amount}`)
  );

  const stepsWrap = document.createElement("section");
  stepsWrap.className = "recipe-steps-wrap";
  const stepsTitle = createTextElement("h4", "조리 순서");
  const steps = document.createElement("ol");
  steps.className = "recipe-steps";
  recipe.steps.forEach((step) => steps.append(createTextElement("li", step)));
  stepsWrap.append(stepsTitle, steps);

  if (includeSaveButton) {
    const actions = document.createElement("div");
    actions.className = "recipe-card-actions";
    const saveButton = document.createElement("button");
    saveButton.className = "button recipe-save-button";
    saveButton.type = "button";
    saveButton.textContent = "내 레시피에 저장";
    saveButton.addEventListener("click", () => saveRecipe(recipe, saveButton));
    actions.append(saveButton);
    card.append(actions);
  }

  card.append(title, description, meta, detailGrid, stepsWrap);
  return card;
}

// 보유 재료나 추가 재료 목록을 접근 가능한 제목과 함께 만듭니다.
function createRecipeIngredientSection(title, items, formatItem) {
  const section = document.createElement("section");
  section.className = "recipe-detail";
  const heading = document.createElement("h4");
  heading.textContent = title;
  const list = document.createElement("ul");

  if (items.length === 0) {
    list.append(createTextElement("li", "없음"));
  } else {
    items.forEach((item) => list.append(createTextElement("li", formatItem(item))));
  }

  section.append(heading, list);
  return section;
}

// 사용자나 모델이 제공한 문자열을 HTML 해석 없이 표시할 요소로 만듭니다.
function createTextElement(tagName, text) {
  const element = document.createElement(tagName);
  element.textContent = text;
  return element;
}

// 서버 세션을 확인하고 로그인 상태에 맞는 계정 버튼을 준비합니다.
async function initializeAccount() {
  try {
    const result = await sendAccountAction("session");
    currentUser = result.user;
    updateAccountButton();
    if (currentUser) {
      await loadProfileAndSavedRecipes();
    }
  } catch {
    currentUser = null;
    updateAccountButton();
  }
}

// 계정 창을 열고 로그인 상태에 맞는 화면을 표시합니다.
async function openAccountDialog() {
  accountMessage.textContent = "";
  accountMessage.classList.remove("is-success");
  showAccountPanel(currentUser ? "profile" : "login");
  if (!accountDialog.open) {
    accountDialog.showModal();
  }

  if (currentUser) {
    await loadProfileAndSavedRecipes();
  }
}

// 계정 창에는 요청한 화면 하나만 노출합니다.
function showAccountPanel(panelName) {
  Object.entries(accountPanels).forEach(([name, panel]) => {
    panel.hidden = name !== panelName;
  });
  accountMessage.textContent = "";
  accountMessage.classList.remove("is-success");
}

// 인증 버튼에 로그인 여부를 표시합니다.
function updateAccountButton() {
  accountButton.textContent = currentUser ? "내 계정" : "로그인";
  accountButton.setAttribute(
    "aria-label",
    currentUser ? `내 계정, ${currentUser.email}` : "로그인 또는 계정 만들기"
  );
}

// 계정 API에 JSON을 보내고 서버가 반환한 오류를 사용자에게 알립니다.
async function requestAccountApi(url, options = {}) {
  const response = await fetch(url, {
    method: options.method || "GET",
    headers: options.body === undefined ? undefined : { "Content-Type": "application/json" },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    cache: "no-store"
  });
  const payload = await readJsonResponse(response);

  if (!response.ok) {
    if (response.status === 401) {
      clearLocalAccountState();
    }
    const message = payload.error && typeof payload.error.message === "string"
      ? payload.error.message
      : "계정 요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.";
    throw new Error(message);
  }

  return payload;
}

// 로그인·로그아웃 등 인증 요청을 같은 출처의 서버 함수로 보냅니다.
function sendAccountAction(action, values = {}) {
  return requestAccountApi("/api/auth", {
    method: "POST",
    body: { action, ...values }
  });
}

// 이메일과 비밀번호로 로그인해 프로필과 저장 레시피를 불러옵니다.
async function signInAccount(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const values = new FormData(form);

  try {
    const result = await sendAccountAction("login", {
      email: values.get("email"),
      password: values.get("password")
    });
    currentUser = result.user;
    updateAccountButton();
    showAccountPanel("profile");
    accountMessage.classList.add("is-success");
    accountMessage.textContent = "로그인했어요.";
    await loadProfileAndSavedRecipes();
    form.reset();
  } catch (error) {
    showAccountError(error);
  }
}

// 표시 이름·이메일·비밀번호로 가입하고 이메일 확인 여부를 안내합니다.
async function signUpAccount(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const values = new FormData(form);

  try {
    const result = await sendAccountAction("signup", {
      displayName: values.get("displayName"),
      email: values.get("email"),
      password: values.get("password")
    });
    form.reset();

    if (result.confirmationRequired) {
      showAccountPanel("login");
      document.querySelector("#login-email").value = values.get("email");
      accountMessage.classList.add("is-success");
      accountMessage.textContent = "가입을 완료했어요. 이메일 확인 링크를 눌러 인증한 뒤 로그인해 주세요.";
      return;
    }

    currentUser = result.user;
    updateAccountButton();
    showAccountPanel("profile");
    accountMessage.classList.add("is-success");
    accountMessage.textContent = "계정을 만들었어요.";
    await loadProfileAndSavedRecipes();
  } catch (error) {
    showAccountError(error);
  }
}

// 계정 이메일에 Supabase 비밀번호 재설정 링크를 요청합니다.
async function requestPasswordReset(event) {
  event.preventDefault();
  const email = new FormData(event.currentTarget).get("email");

  try {
    const result = await sendAccountAction("password-reset", { email });
    accountMessage.classList.add("is-success");
    accountMessage.textContent = result.message;
  } catch (error) {
    showAccountError(error);
  }
}

// 이메일 링크에서 받은 1회용 토큰으로 새 비밀번호를 설정합니다.
async function setNewPassword(event) {
  event.preventDefault();
  if (!recoveryAccessToken) {
    showAccountPanel("login");
    showAccountError(new Error("비밀번호 재설정 링크가 없거나 만료됐어요. 이메일을 다시 요청해 주세요."));
    return;
  }

  const password = new FormData(event.currentTarget).get("password");
  try {
    await sendAccountAction("password-update", {
      accessToken: recoveryAccessToken,
      password
    });
    recoveryAccessToken = null;
    event.currentTarget.reset();
    showAccountPanel("login");
    accountMessage.classList.add("is-success");
    accountMessage.textContent = "비밀번호를 변경했어요. 새 비밀번호로 로그인해 주세요.";
  } catch (error) {
    showAccountError(error);
  }
}

// 계정의 식단 선호와 기본 인분을 인증된 사용자 프로필에 저장합니다.
async function saveProfile(event) {
  event.preventDefault();
  const values = new FormData(event.currentTarget);

  try {
    const result = await requestAccountApi("/api/profile", {
      method: "PUT",
      body: {
        displayName: values.get("displayName"),
        dietPreference: values.get("dietPreference"),
        defaultServings: Number(values.get("defaultServings"))
      }
    });
    currentProfile = result.profile;
    applyProfileDefaults(currentProfile);
    accountMessage.classList.add("is-success");
    accountMessage.textContent = "프로필을 저장했어요.";
  } catch (error) {
    showAccountError(error);
  }
}

// 인증이 필요한 계정 데이터만 서버에서 읽고 생성 조건의 기본값을 적용합니다.
async function loadProfileAndSavedRecipes() {
  if (!currentUser) {
    return;
  }

  try {
    document.querySelector("#profile-email").textContent = currentUser.email;
    const [profileResult, savedResult] = await Promise.all([
      requestAccountApi("/api/profile"),
      requestAccountApi("/api/saved-recipes")
    ]);

    currentProfile = profileResult.profile;
    savedRecipes = savedResult.recipes;
    document.querySelector("#profile-name").value = currentProfile.display_name || "";
    document.querySelector("#profile-diet").value = currentProfile.diet_preference || "";
    document.querySelector("#profile-servings").value = String(currentProfile.default_servings || 2);
    applyProfileDefaults(currentProfile);
    renderSavedRecipes();
    updateCurrentRecipeSaveButtons();
  } catch (error) {
    showAccountError(error);
    if (/로그인이 만료|로그인이 필요/.test(error.message)) {
      clearLocalAccountState();
    }
  }
}

// 사용자 프로필은 기본값으로만 반영하고 레시피 조건을 강제로 덮어쓰지 않습니다.
function applyProfileDefaults(profile) {
  if (!profile) {
    return;
  }

  const servings = document.querySelector("#servings");
  if (profile.default_servings && servings.querySelector(`option[value="${profile.default_servings}"]`)) {
    servings.value = String(profile.default_servings);
  }

  const diet = document.querySelector("#diet-preference");
  if (!diet.value && profile.diet_preference) {
    diet.value = profile.diet_preference;
  }
}

// 로그아웃하고 브라우저 메모리의 계정 정보와 저장 목록을 비웁니다.
async function signOutAccount() {
  try {
    await sendAccountAction("logout");
    clearLocalAccountState();
    showAccountPanel("login");
    accountMessage.classList.add("is-success");
    accountMessage.textContent = "로그아웃했어요.";
  } catch (error) {
    showAccountError(error);
  }
}

// 현재 비밀번호를 확인한 후 계정과 저장 데이터를 영구 삭제합니다.
async function deleteAccount() {
  const password = document.querySelector("#delete-account-password").value;
  if (!password) {
    showAccountError(new Error("계정 삭제를 위해 현재 비밀번호를 입력해 주세요."));
    return;
  }

  if (!window.confirm("프로필과 저장한 모든 레시피가 영구 삭제됩니다. 계속할까요?")) {
    return;
  }

  try {
    await sendAccountAction("delete-account", { password });
    clearLocalAccountState();
    showAccountPanel("login");
    accountMessage.classList.add("is-success");
    accountMessage.textContent = "계정과 연결된 데이터를 삭제했어요.";
  } catch (error) {
    showAccountError(error);
  }
}

// 로그인한 사용자에게만 레시피 저장을 허용합니다.
async function saveRecipe(recipe, button) {
  if (!currentUser) {
    await openAccountDialog();
    showAccountPanel("login");
    accountMessage.textContent = "레시피를 저장하려면 로그인해 주세요.";
    return;
  }

  button.disabled = true;
  try {
    const result = await requestAccountApi("/api/saved-recipes", {
      method: "POST",
      body: { recipe }
    });
    const existingIndex = savedRecipes.findIndex((saved) => saved.id === result.recipe.id);
    if (existingIndex < 0) {
      savedRecipes.unshift(result.recipe);
    }
    renderSavedRecipes();
    updateCurrentRecipeSaveButtons();
    recipeMessage.textContent = result.alreadySaved ? "이 레시피는 이미 저장되어 있어요." : "레시피를 내 목록에 저장했어요.";
  } catch (error) {
    recipeMessage.textContent = error.message;
    if (/로그인이 만료|로그인이 필요/.test(error.message)) {
      clearLocalAccountState();
      await openAccountDialog();
    }
  } finally {
    button.disabled = false;
  }
}

// 서버에서 받아온 사용자 소유 레시피만 저장 목록에 표시합니다.
function renderSavedRecipes() {
  savedRecipeList.replaceChildren();
  savedCount.textContent = `${savedRecipes.length}개`;
  savedEmpty.hidden = savedRecipes.length > 0;

  savedRecipes.forEach((saved) => {
    const item = document.createElement("li");
    item.className = "saved-recipe-item";

    const row = document.createElement("div");
    row.className = "saved-recipe-row";
    const title = document.createElement("button");
    title.className = "saved-recipe-title";
    title.type = "button";
    title.textContent = saved.title;
    title.setAttribute("aria-expanded", "false");

    const removeButton = document.createElement("button");
    removeButton.className = "button button-small-danger";
    removeButton.type = "button";
    removeButton.textContent = "삭제";
    removeButton.setAttribute("aria-label", `${saved.title} 저장 해제`);

    const date = document.createElement("p");
    date.className = "saved-recipe-date";
    date.textContent = formatSavedDate(saved.created_at);

    const detail = document.createElement("div");
    detail.className = "saved-recipe-detail";
    detail.hidden = true;
    detail.append(createRecipeCard(saved.recipe, false));

    title.addEventListener("click", () => {
      detail.hidden = !detail.hidden;
      title.setAttribute("aria-expanded", String(!detail.hidden));
    });
    removeButton.addEventListener("click", () => removeSavedRecipe(saved.id, item));

    row.append(title, removeButton);
    item.append(row, date, detail);
    savedRecipeList.append(item);
  });

  updateCurrentRecipeSaveButtons();
}

// 저장 날짜를 한국어 형식으로 표시하고 잘못된 값은 명시적으로 안내합니다.
function formatSavedDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "저장 날짜를 확인할 수 없어요.";
  }
  return `저장일 ${new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium" }).format(date)}`;
}

// 현재 로그인 사용자의 저장 목록에서 레시피를 제거합니다.
async function removeSavedRecipe(id, item) {
  try {
    await requestAccountApi("/api/saved-recipes", {
      method: "DELETE",
      body: { id }
    });
    savedRecipes = savedRecipes.filter((saved) => saved.id !== id);
    item.remove();
    renderSavedRecipes();
    accountMessage.classList.add("is-success");
    accountMessage.textContent = "저장한 레시피를 삭제했어요.";
  } catch (error) {
    showAccountError(error);
  }
}

// 저장 목록과 생성 결과를 비교해 카드의 저장 버튼 상태를 맞춥니다.
function updateCurrentRecipeSaveButtons() {
  const savedKeys = new Set(savedRecipes.map((saved) => recipeContentKey(saved.recipe)));
  document.querySelectorAll("#recipe-results .recipe-item").forEach((card) => {
    const button = card.querySelector(".recipe-save-button");
    if (!button) {
      return;
    }
    const recipe = recipeFromCard(card);
    if (!recipe) {
      return;
    }
    const alreadySaved = savedKeys.has(recipeContentKey(recipe));
    button.textContent = alreadySaved ? "저장됨" : "내 레시피에 저장";
    button.disabled = alreadySaved;
  });
}

// 현재 카드가 가진 순수 텍스트를 비교해 저장 상태를 확인합니다.
function recipeFromCard(card) {
  const title = card.querySelector("h3")?.textContent;
  const description = card.querySelector(".recipe-description")?.textContent;
  const meta = Array.from(card.querySelectorAll(".recipe-meta span"), (span) => span.textContent);
  const details = card.querySelectorAll(".recipe-detail");
  const steps = card.querySelectorAll(".recipe-steps li");

  if (!title || !description || meta.length !== 2 || details.length !== 2 || steps.length < 2) {
    return null;
  }

  const availableIngredients = Array.from(details[0].querySelectorAll("li"), (item) => item.textContent);
  const additionalIngredients = Array.from(details[1].querySelectorAll("li"), (item) => {
    const [name, ...amount] = item.textContent.split(" · ");
    return { name, amount: amount.join(" · ") };
  }).filter((item) => item.name !== "없음");

  return {
    title,
    description,
    cookingTimeMinutes: Number(meta[0].match(/\d+/)?.[0]),
    servings: Number(meta[1].match(/\d+/)?.[0]),
    availableIngredients: availableIngredients.filter((item) => item !== "없음"),
    additionalIngredients,
    steps: Array.from(steps, (step) => step.textContent)
  };
}

// 레시피 버전 메타데이터를 제외한 본문만 고정된 필드 순서로 비교합니다.
function recipeContentKey(recipe) {
  return JSON.stringify({
    title: recipe.title,
    description: recipe.description,
    cookingTimeMinutes: recipe.cookingTimeMinutes,
    servings: recipe.servings,
    availableIngredients: recipe.availableIngredients,
    additionalIngredients: recipe.additionalIngredients,
    steps: recipe.steps
  });
}

// 브라우저 메모리의 사용자·프로필·레시피 정보를 초기화합니다.
function clearLocalAccountState() {
  currentUser = null;
  currentProfile = null;
  savedRecipes = [];
  document.querySelector("#diet-preference").value = "";
  document.querySelector("#allergy-notes").value = "";
  document.querySelector("#servings").value = "2";
  document.querySelector("#delete-account-password").value = "";
  updateAccountButton();
  renderSavedRecipes();
}

// 계정 오류를 현재 계정 창에 안전하게 표시합니다.
function showAccountError(error) {
  accountMessage.classList.remove("is-success");
  accountMessage.textContent = error instanceof Error
    ? error.message
    : "계정 요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.";
}

// Supabase 복구 링크의 해시 토큰을 주소창에서 제거하고 비밀번호 화면을 엽니다.
function handlePasswordRecoveryLink() {
  if (!window.location.hash) {
    return;
  }

  const parameters = new URLSearchParams(window.location.hash.slice(1));
  if (parameters.get("type") !== "recovery") {
    return;
  }

  recoveryAccessToken = parameters.get("access_token");
  window.history.replaceState(null, document.title, `${window.location.pathname}${window.location.search}`);
  if (!accountDialog.open) {
    accountDialog.showModal();
  }
  showAccountPanel("newPassword");
  if (!recoveryAccessToken) {
    showAccountError(new Error("비밀번호 재설정 링크가 올바르지 않아요. 이메일을 다시 요청해 주세요."));
  }
}
