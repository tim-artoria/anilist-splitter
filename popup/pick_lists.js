async function requestAniGraphQL(graphqlRequest) {
  const request = new Request("https://anilist.co/graphql", {
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

const graphQLRequest = (userName) => ({
  query: `
  query ($userName: String, $type: MediaType) {
    MediaListCollection(userName: $userName, type: $type) {
      lists {
        name
        isCustomList
      }
    }
  }
  `,
  variables: {
    userName: userName,
    type: "ANIME"
  }
});

async function getCustomLists() {
  const userName = (await browser.storage.sync.get("userName"))["userName"];

  const result = await requestAniGraphQL(graphQLRequest(userName));

  return result["data"]["MediaListCollection"]["lists"]
    .filter(l => l["isCustomList"] === true)
    .map(l => l["name"]);
}

async function updateSplitLists() {
  const splitLists = Array.from(document.querySelectorAll('.list > :checked')).map(elem => elem.id);
  
  await browser.storage.sync.set({ splitLists });

  const [tab] = await browser.tabs.query({
    active: true,
    currentWindow: true
  });
  
  await browser.tabs.sendMessage(tab.id, { command: "updateLists" });
}

window.onload = async () => {
  const customLists = await getCustomLists();

  const splitLists = (await browser.storage.sync.get("splitLists"))["splitLists"];

  const listTemplate = document.querySelector('.list[hidden]');

  customLists.forEach(name => {
    const newListElem = listTemplate.cloneNode(true);
    
    newListElem.hidden = false;

    newListElem.querySelector('input').id = name;
    newListElem.querySelector('input').checked = splitLists.includes(name);
    newListElem.querySelector('input').onchange = updateSplitLists;

    newListElem.querySelector('label').for = name;
    newListElem.querySelector('label').textContent = name;
    newListElem.querySelector('label').onclick = () => {
      newListElem.querySelector('input').checked ^= 1;
      updateSplitLists();
    }
    
    listTemplate.parentElement.insertBefore(newListElem, listTemplate);
  })
}
