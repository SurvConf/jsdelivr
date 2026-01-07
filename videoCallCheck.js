async function startJoin(){
	await join();
}
  /*
 *  These procedures use Agora Video Call SDK for Web to enable local and remote
 *  users to join and leave a Video Call channel managed by Agora Platform.
 */

/*
 *  Create an {@link https://docs.agora.io/en/Video/API%20Reference/web_ng/interfaces/iagorartcclient.html|AgoraRTCClient} instance.
 *
 * @param {string} mode - The {@link https://docs.agora.io/en/Voice/API%20Reference/web_ng/interfaces/clientconfig.html#mode| streaming algorithm} used by Agora SDK.
 * @param  {string} codec - The {@link https://docs.agora.io/en/Voice/API%20Reference/web_ng/interfaces/clientconfig.html#codec| client codec} used by the browser.
 */
var client = [];

/*
 * Clear the video and audio tracks used by `client` on initiation.
 */
var localTracks = [];

/*
 * On initiation no users are connected.
 */
var remoteUsers = {};


// --- subscribe serialization helpers (band-aid for old Agora SDK) ---
const subscribeQueue = new Map();   // uid -> Promise chain (serialize per user)
const pendingMedia = new Map();     // uid -> Set("audio"|"video")
const subscribed = new Set();       // "uid:mediaType" to avoid duplicates

/*
 * On initiation. `client` is not attached to any project or channel for any specific user.
 */
options = {
        mode:null,
        codec:null,
        appID:null,
        channel: null,
        uid:null,
        token:null,
      };

AgoraRTC.onAutoplayFailed = () => {
  alert("click to start autoplay!")
}

AgoraRTC.onMicrophoneChanged = async (changedDevice) => {
  // When plugging in a device, switch to a device that is newly plugged in.
  if (changedDevice.state === "ACTIVE") {
    localTracks.audioTrack.setDevice(changedDevice.device.deviceId);
    // Switch to an existing device when the current device is unplugged.
  } else if (changedDevice.device.label === localTracks.audioTrack.getTrackLabel()) {
    const oldMicrophones = await AgoraRTC.getMicrophones();
    oldMicrophones[0] && localTracks.audioTrack.setDevice(oldMicrophones[0].deviceId);
  }
}

AgoraRTC.onCameraChanged = async (changedDevice) => {
  // When plugging in a device, switch to a device that is newly plugged in.
  if (changedDevice.state === "ACTIVE") {
    localTracks.videoTrack.setDevice(changedDevice.device.deviceId);
    // Switch to an existing device when the current device is unplugged.
  } else if (changedDevice.device.label === localTracks.videoTrack.getTrackLabel()) {
    const oldCameras = await AgoraRTC.getCameras();
    oldCameras[0] && localTracks.videoTrack.setDevice(oldCameras[0].deviceId);
  }
}




/*
 * Join a channel, then create local video and audio tracks and publish them to the channel.
 */
async function join() {

  // Add an event listener to play remote tracks when remote user publishes.
  client.on("user-published", handleUserPublished);
  client.on("user-unpublished", handleUserUnpublished);

  console.log(options);
  // Join a channel and create local tracks. Best practice is to use Promise.all and run them concurrently.
  [ options.uid, localTracks.audioTrack, localTracks.videoTrack ] = await Promise.all([
    // Join the channel.
    client.join(options.appid, options.channel, options.token || null, options.uid || null),
    // Create tracks to the local microphone and camera.
    AgoraRTC.createMicrophoneAudioTrack(),
    AgoraRTC.createCameraVideoTrack()
  ]);

  if(localTracks.audioTrack._enabled){
  	jQuery('#audio-connected').text('Success');
  	jQuery('#audio-connected').css('color','green');
  }
  else{
    jQuery('#audio-connected').text('Failed');
    jQuery('#audio-connected').css('color','red');
  }
  if(localTracks.videoTrack._enabled){
  	jQuery('#video-connected').text('Success');
  	jQuery('#video-connected').css('color','green');
  }
  else{
    jQuery('#video-connected').text('Failed');
    jQuery('#video-connected').css('color','red');
  }
  if(localTracks.videoTrack._enabled && localTracks.audioTrack._enabled || ((localTracks.videoTrack._enabled && videoOnly) || (localTracks.audioTrack._enabled && audioOnly)) ){
    jQuery('#continue-button').text('Click here to continue');
    jQuery('#continue-button').css('color','white');
    jQuery('#continue-button').attr('disabled',false);
    await leave();
  }
  else{
    jQuery('#continue-button').text('Connection Failed. Change your settings and refresh to try again. Otherwise, you are not eligible for this study.');
  }

  jQuery('#continue-button').on('click',async function(event) {
  	await leave();

    jQuery('#NextButton').click();
  });
  
}

/*
 * Stop all local and remote tracks then leave the channel.
 */
async function leave() {
  console.log('leaving');
  for (trackName in localTracks) {
    var track = localTracks[trackName];
    if(track) {
      track.stop();
      try{
		track.close();
      }
      catch(error){
      	console.log(error);
      }
      	
      localTracks[trackName] = undefined;
    }
  }

  // Remove remote users and player views.
  remoteUsers = {};

  console.log('leaving client');
  // leave the channel
  await client.leave();


  console.log("client leaves channel success");
}


/*
 * Add the local use to a remote channel.
 *
 * @param  {IAgoraRTCRemoteUser} user - The {@link  https://docs.agora.io/en/Voice/API%20Reference/web_ng/interfaces/iagorartcremoteuser.html| remote user} to add.
 * @param {trackMediaType - The {@link https://docs.agora.io/en/Voice/API%20Reference/web_ng/interfaces/itrack.html#trackmediatype | media type} to add.
 */
async function subscribe(user, mediaType) {
  console.log("MEDIA TYPE: " + mediaType);

  const uid = user.uid;
  const key = `${uid}:${mediaType}`;

  // Prevent duplicate subscribe calls (common when Agora fires multiple events)
  if (subscribed.has(key)) {
    console.log("already subscribed", key);
    return;
  }
  subscribed.add(key);

  try {
    // Subscribe to the remote user
    await client.subscribe(user, mediaType);
    console.log("subscribe success", uid, mediaType);
  } catch (err) {
    // If it failed, allow retry later (important!)
    subscribed.delete(key);
    console.error("subscribe failed", uid, mediaType, err);
    throw err;
  }

  // ------- your existing UI / play logic -------
  if (nameDisplay == 'true') {
    name_param = '';
  } else {
    name_param = 'style="display:none"';
  }

  if (mediaType === 'video') {
    const player = jQuery(`
      <div id="player-wrapper-${uid}">
        <p class="player-name" ${name_param}>${rolelist[uid - 1]}</p>
        <div id="player-${uid}" class="player"></div>
      </div>
    `);

    jQuery("#remote-playerlist").append(player);
    user.videoTrack.play(`player-${uid}`);
  }

  if (mediaType === 'audio') {
    user.audioTrack.play();

    if (audioOnly == 'true') {
      const player = jQuery(`
        <div id="player-wrapper-${uid}">
          <p class="player-name" ${name_param}>${rolelist[uid - 1]}</p>
          <div id="player-${uid}" class="player"></div>
        </div>
      `);

      jQuery("#remote-playerlist").append(player);

      jQuery(`#player-${uid}`).append(
        `<div style="width: 100%; height: 100%; position: relative; overflow: hidden; background-color: white; display: table; border: 3px solid black;"></div>`
      );
      jQuery(`#player-${uid} > div`)
        .css('background-color', 'white')
        .css('display', 'table')
        .css('border', '3px solid black')
        .append(`<h3 class='audio-name'>${rolelist[uid - 1]}</h3>`);

      jQuery('.agora_video_player').css('display', 'none');
    }
  }

  // ------- your existing timer logic (unchanged) -------
  if (!already_started) {
    clearTimeout(lastJoinItv);

    if (client.remoteUsers.length >= group_size - 1) {
      console.log('timer started group full');
      already_started = true;
      timer_itv = setInterval(function () {
        console.log(time_left);
        time_left -= 1;
        jQuery('#timer').text(
          Math.floor(time_left / 60).toString().padStart(2, '0') +
          ':' +
          (time_left % 60).toString().padStart(2, '0')
        );
        if (time_left <= 0) {
          clearInterval(timer_itv);
          Qualtrics.SurveyEngine.setEmbeddedData("callCompleted", "true");
          jQuery('#NextButton').click();
        }
      }, 1000);
    } else {
      console.log('timer waiting 5 seconds for next join');
      lastJoinItv = setTimeout(function () {
        console.log('timer started, 5 second timeout');
        already_started = true;
        timer_itv = setInterval(function () {
          console.log(time_left);
          time_left -= 1;
          jQuery('#timer').text(
            Math.floor(time_left / 60).toString().padStart(2, '0') +
            ':' +
            (time_left % 60).toString().padStart(2, '0')
          );
          if (time_left <= 0) {
            clearInterval(timer_itv);
            Qualtrics.SurveyEngine.setEmbeddedData("callCompleted", "true");
            jQuery('#NextButton').click();
          }
        }, 1000);
      }, timeToWait * 1000);
    }
  }
}

/*
 * Add a user who has subscribed to the live channel to the local interface.
 *
 * @param  {IAgoraRTCRemoteUser} user - The {@link  https://docs.agora.io/en/Voice/API%20Reference/web_ng/interfaces/iagorartcremoteuser.html| remote user} to add.
 * @param {trackMediaType - The {@link https://docs.agora.io/en/Voice/API%20Reference/web_ng/interfaces/itrack.html#trackmediatype | media type} to add.
 */
function handleUserPublished(user, mediaType) {
  console.log('user published', user.uid, mediaType);
  const uid = user.uid;
  remoteUsers[uid] = user;

  // Track what we still need to subscribe for this uid
  if (!pendingMedia.has(uid)) pendingMedia.set(uid, new Set());
  pendingMedia.get(uid).add(mediaType);

  // Serialize subscribe operations per uid
  const prev = subscribeQueue.get(uid) || Promise.resolve();
  const next = prev
    .then(() => subscribePendingForUser(user))
    .catch((e) => console.error("subscribe chain error", uid, e));

  subscribeQueue.set(uid, next);
}

/*
 * Remove the user specified from the channel in the local interface.
 *
 * @param  {string} user - The {@link  https://docs.agora.io/en/Voice/API%20Reference/web_ng/interfaces/iagorartcremoteuser.html| remote user} to remove.
 */
function handleUserUnpublished(user, mediaType) {
  if (mediaType === 'video') {
    const id = user.uid;
    delete remoteUsers[id];
    $(`#player-wrapper-${id}`).remove();

  }
}
