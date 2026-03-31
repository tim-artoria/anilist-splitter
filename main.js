const sleep = ms => new Promise(r => setTimeout(r, ms));

const graphQLRequest = (userName) => ({
  query: `
  query ($userName: String, $type: MediaType) {
    MediaListCollection(
      userName: $userName
      type: $type
      status_in: [CURRENT, REPEATING]
      sort: UPDATED_TIME_DESC
    ) {
      lists {
        name
        status
        entries {
          media {
            id
          }
        }
      }
    }
  }
  `,
  variables: {
    userName: userName,
    type: "ANIME"
  }
});

function findUserName() {
  const userElem = document.getElementsByClassName("user")[0]; // profile icon on the top right of the website
  const userName = userElem.innerHTML.match(/href\=\"\/user\/(.+)\/\"/)[1]; // first group of the matched regexp  
  browser.storage.sync.set({userName: userName});
  return userName;
}

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

async function fetchMediaListCollection(userName) {
  const result = await requestAniGraphQL(graphQLRequest(userName));
  console.log(result);

  return Object.fromEntries(
    result["data"]["MediaListCollection"]["lists"]
    .map(l => [l["name"], l["entries"].map(e => e["media"]["id"])])
  );
}

function addList(name, mediaListCollection, listsElem) {  
  // clone the first existing list, make the new list the $name list
  // and add it to the element, that has all the lists
  const newWrapper = listsElem.firstElementChild.cloneNode(true);
  newWrapper.querySelector('.section-header').querySelector('h2').innerHTML = `Anime in ${name}`;
  listsElem.insertBefore(newWrapper, listsElem.firstChild);

  // empty the cloned list
  const newList = newWrapper.querySelector('.list-preview');
  newList.innerHTML = "";

  // move entries to the new list, that belong there
  // this way we keep onclick events and stuff
  mediaListCollection[name].forEach(id => {
    const elemToMove = listsElem.querySelector(`a[href^="/anime/${id}/"]`).parentElement;
    if (elemToMove) newList.appendChild(elemToMove);
  });
}

async function updateLists(mediaListCollection, listsElem) {
  
  // get the current anime list and make it the new rewatching list
  const rewatchingWrapper = listsElem.firstElementChild;
  rewatchingWrapper.querySelector('.section-header').querySelector('h2').innerHTML = "Anime in Rewatching";

  if ("Watching" in mediaListCollection) {
    addList("Watching", mediaListCollection, listsElem);
  }

  let splitLists = (await browser.storage.sync.get())["splitLists"];

  if (splitLists === undefined) {
    splitLists = [];
    await browser.storage.sync.set({ splitLists });
  }

  splitLists.filter(name => name in mediaListCollection).forEach(name => addList(name, mediaListCollection, listsElem));

  Array.from(listsElem.querySelectorAll('*:has(.list-preview:empty)'))
    .forEach(wrapper => wrapper.remove());
}

async function main() {
  // fetch all entries, that would normally be displayed (CURRENT, REPEATING)
  const userName = findUserName();
  const mediaListCollection = await fetchMediaListCollection(userName);
  console.log(mediaListCollection);
  
  // get the element, that has all the lists
  const listsElem = document.querySelector('.list-previews');

  // wait for the website to load the anime entries
  const nrOfEntries = mediaListCollection["Watching"].length + mediaListCollection["Rewatching"].length;
  const nrOfElems = () => listsElem.querySelectorAll('a.cover[href^="/anime/"]').length;
  while (nrOfElems() < Math.min(nrOfEntries, 20)) {
    await sleep(200);
  }

  updateLists(mediaListCollection, listsElem);

  browser.runtime.onMessage.addListener(async (message) => {
    if (message.command === "updateLists") {
      const mediaListCollection = await fetchMediaListCollection(userName);
      updateLists(mediaListCollection, listsElem);
    }
  });
}

main();
