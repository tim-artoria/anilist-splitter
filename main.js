const sleep = ms => new Promise(r => setTimeout(r, ms));

const graphQLRequest = (userName) => ({
  query: `
  query ($userName: String) {
    MediaListCollection(
      userName: $userName
      type: ANIME
      status_in: [CURRENT, REPEATING]
      sort: UPDATED_TIME_DESC
    ) {
      lists {
        name
        status
        entries {
          progress
          media {
            id
            episodes
            coverImage {
              large
            }
            nextAiringEpisode {
              timeUntilAiring
              episode
            }
          }
        }
      }
    }
  }
  `,
  variables: {
    userName: userName
  }
});

function findUserName() {
  const userElem = document.getElementsByClassName("user")[0]; // profile icon on the top right of the website
  const userName = userElem.innerHTML.match(/href\=\"\/user\/(.+)\/\"/)[1]; // first group of the matched regexp  
  browser.storage.sync.set({ userName: userName });
  return userName;
}

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

async function fetchMediaListCollection(userName) {
  const result = await requestAniGraphQL(graphQLRequest(userName));

  return Object.fromEntries(
    result["data"]["MediaListCollection"]["lists"]
      .map(l => [l["name"], l["entries"].map(e => {
        e["media"]["progress"] = e["progress"];
        return e["media"];
      })])
  );
}

function addList(name, mediaListCollection, listsElem) {
  // clone the first existing list, make the new list the $name list
  // and add it to the element, that has all the lists
  const newWrapper = listsElem.firstElementChild.cloneNode(true);
  newWrapper.querySelector('.section-header').querySelector('h2').textContent = `Anime in ${name}`;
  newWrapper.dataset.animeListName = name;

  listsElem.insertBefore(newWrapper, listsElem.firstChild);

  // empty the cloned list
  const newList = newWrapper.querySelector('.list-preview');
  newList.innerHTML = "";

  // move entries to the new list, that belong there
  // this way we keep onclick events and stuff
  mediaListCollection[name].forEach(media => {
    const childElem = listsElem.querySelector(`a[href^="/anime/${media["id"]}/"]`);
    let elemToMove;
    if (childElem === null) {
      elemToMove = listsElem.querySelector('.media-preview-card').cloneNode(true);
      elemToMove.style.opacity = 0.5;

      const content = elemToMove.querySelector('.content');
      if (content) content.remove();

      const cover = elemToMove.querySelector('.cover');
      cover.href = `/anime/${media["id"]}/`;
      cover.dataset.src = media["coverImage"]["large"];
      cover.style.backgroundImage = `url("${cover.dataset.src}")`;
      cover.innerHTML = "";

      const progress = Number(media["progress"]);
      const episodes = Number(media["episodes"]);

      if (media["nextAiringEpisode"]) {
        const t = media["nextAiringEpisode"]["timeUntilAiring"];
        const t_d = Math.floor(t / 86400);
        const t_h = Math.floor(t / 3600) % 24;
        const t_m = Math.floor(t / 60) % 60;
        const nextEp = Number(media["nextAiringEpisode"]["episode"]);
        const isBehind = progress < nextEp - 1;

        cover.innerHTML = `
          <div data-v-6dc78144="" class="image-text">
            <div data-v-2fd80e52="" class="${isBehind ? 'isBehind' : ''}">
              <div data-v-2fd80e52="" class="countdown"><span>
  			        Ep ${nextEp}
  			        ${t_d ? `<span>${t_d}d</span> ` : ''}${t_h ? `<span>${t_h}h</span> ` : ''}${t_m ? `<span>${t_m}m</span>` : ''}</span>
  			      </div>
  			      ${isBehind ? '<div data-v-2fd80e52="" class="behind-accent"></div>' : ''}
  			    </div>
  			  </div>
  			`;
      }
      
      cover.innerHTML += `
        <div data-v-6dc78144="" class="image-overlay">
			    <div data-v-2fd80e52="">
			      <div data-v-2fd80e52="" class="plus-progress">${progress}${episodes ? `/${episodes}` : ''}</div>
          </div>
        </div>
      `;
    } else {
      elemToMove = childElem.parentElement;
    }

    newList.appendChild(elemToMove);
  });
}

async function updateLists(mediaListCollection, listsElem) {
  let { animeConsumeOrder, animeDisplayOrder } = await browser.storage.sync.get();

  if (animeConsumeOrder === undefined) {
    animeConsumeOrder = ["Watching", "Rewatching"];
    await browser.storage.sync.set({ animeConsumeOrder });
  }

  if (animeDisplayOrder === undefined) {
    animeDisplayOrder = ["Watching", "Rewatching"];
    await browser.storage.sync.set({ animeDisplayOrder });
  }

  animeConsumeOrder.filter(name => name in mediaListCollection).reverse().forEach(name => addList(name, mediaListCollection, listsElem));

  Array.from(listsElem.querySelectorAll('*:has(.list-preview:empty)'))
    .forEach(wrapper => wrapper.remove());

  animeDisplayOrder
    .reverse()
    .map(name => listsElem.querySelector(`[data-anime-list-name="${name}"]`))
    .filter(elem => elem !== null)
    .forEach(elem => listsElem.insertBefore(elem, listsElem.firstElementChild));
}

async function main() {
  // fetch all entries, that would normally be displayed (CURRENT, REPEATING)
  const userName = findUserName();
  const mediaListCollection = await fetchMediaListCollection(userName);

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

let previousUrl = '';
const observer = new MutationObserver(() => {
  if (location.href === previousUrl) return;
  previousUrl = location.href;
  if (location.href !== "https://anilist.co/home") return;
  main();
});
observer.observe(document.body, { childList: true, subtree: true });
