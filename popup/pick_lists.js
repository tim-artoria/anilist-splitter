const graphQLRequest = (userName) => ({
  query: `
    query ($userName: String) {
      User(name: $userName) {
        mediaListOptions {
          animeList {
            customLists
          }
        }
      }
    }
  `,
  variables: {
    userName: userName
  }
});

async function requestAniGraphQL(graphqlRequest) {
  const request = new Request("https://graphql.anilist.co/", {
    method: "POST",
    body: JSON.stringify(graphqlRequest),
    headers: {
      "Content-Type": "application/json"
    }
  });

  try {
    const response = await fetch(request);
    if (!response.ok) {
      throw new Error(`Response status: ${response.status}`);
    }

    return response.json();

  } catch (error) {
    console.error(error.message);
  }
}

async function getCustomLists() {
  const userName = (await browser.storage.sync.get("userName"))["userName"];

  const result = await requestAniGraphQL(graphQLRequest(userName));

  return result["data"]["User"]["mediaListOptions"]["animeList"]["customLists"];
}

async function updateOrderLists() {
  const animeConsumeOrder = Array.from(document.querySelectorAll('#anime-consume-order > .enabled > div.list')).map(elem => elem.dataset.listName);
  const animeDisplayOrder = Array.from(document.querySelectorAll('#anime-display-order > div.list')).map(elem => elem.dataset.listName);

  animeConsumeOrder.filter(name => !animeDisplayOrder.includes(name)).forEach(name => {
    animeDisplayOrder.push(name);
    addList(name, document.querySelector('#anime-display-order'));
  });
  animeDisplayOrder.filter(name => !animeConsumeOrder.includes(name)).forEach(name => {
    animeDisplayOrder.splice(animeDisplayOrder.indexOf(name), 1);
    document.querySelector(`#anime-display-order > [data-list-name="${name}"]`).remove();
  });

  await browser.storage.sync.set({ animeConsumeOrder, animeDisplayOrder });

  const [tab] = await browser.tabs.query({
    active: true,
    currentWindow: true
  });

  await browser.tabs.sendMessage(tab.id, { command: "updateLists" });
}

function getDragAfterElement(container, y) {
  const draggableElements = Array.from(container.querySelectorAll(".list"));

  return draggableElements.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) {
      return {
        offset: offset, element: child,
      };
    } else {
      return closest;
    }
  }, {
    offset: Number.NEGATIVE_INFINITY,
  }).element;
};

function dragStartHandler(event) {
  setTimeout(() => {
    event.target.style.display = 'none';
  }, 5);
}

function dragEndHandler(event) {
  const container = event.target.closest('.lists');
  const afterElement = getDragAfterElement(container, event.clientY);

  if (afterElement == null) {
    container.appendChild(event.target);
  } else {
    afterElement.parentElement.insertBefore(event.target, afterElement);
  }

  updateOrderLists();

  event.target.style.display = '';
}

function initDraggable() {
  const animeConsumeOrder = document.querySelector('#anime-consume-order');
  animeConsumeOrder.addEventListener("dragstart", dragStartHandler);
  animeConsumeOrder.addEventListener("dragend", dragEndHandler);

  const animeDisplayOrder = document.querySelector('#anime-display-order');
  animeDisplayOrder.addEventListener("dragstart", dragStartHandler);
  animeDisplayOrder.addEventListener("dragend", dragEndHandler);
}

function addList(name, container) {
  const newListElem = document.querySelector('div.list[hidden]').cloneNode(true);
  newListElem.dataset.listName = name;
  newListElem.textContent = name;
  newListElem.hidden = false;
  newListElem.draggable = true;
  container.appendChild(newListElem);
}

window.onload = async () => {
  initDraggable();

  const allLists = ["Watching", "Rewatching"].concat(await getCustomLists());

  let { animeDisplayOrder, animeConsumeOrder } = await browser.storage.sync.get();

  // get all lists currently not separated
  let animeConsumeOrderDis = allLists.filter(name => !animeConsumeOrder.includes(name));

  let container = document.querySelector('#anime-consume-order > .enabled');
  animeConsumeOrder.forEach(name => addList(name, container));
  container.appendChild(container.querySelector('#anime-consume-order-separator'));

  container = document.querySelector('#anime-consume-order');
  animeConsumeOrderDis.forEach(name => addList(name, container));

  container = document.querySelector('#anime-display-order');
  animeDisplayOrder.forEach(name => addList(name, container));
}
