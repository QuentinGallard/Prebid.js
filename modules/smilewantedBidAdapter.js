import {deepAccess, deepClone, deepSetValue, isArray, isFn, isPlainObject, logError, logWarn} from '../src/utils.js';
import {Renderer} from '../src/Renderer.js';
import {config} from '../src/config.js';
import {registerBidder} from '../src/adapters/bidderFactory.js';
import {BANNER, NATIVE, VIDEO} from '../src/mediaTypes.js';
import {INSTREAM, OUTSTREAM} from '../src/video.js';
import {serializeSupplyChain} from '../libraries/schainSerializer/schainSerializer.js'
import {ortbConverter} from '../libraries/ortbConverter/converter.js'
import {convertOrtbRequestToProprietaryNative, toOrtbNativeRequest, toLegacyResponse} from '../src/native.js';
import * as utils from "../src/utils";

const BIDDER_CODE = 'smilewanted';
const SMILEWANTED_ENDPOINT = 'https://prebid.smilewanted.com';
const GVL_ID = 639;
const CURRENCY = 'EUR';
const TTL = 300; // TODO

/**
 * @typedef {import('../src/adapters/bidderFactory.js').BidRequest} BidRequest
 * @typedef {import('../src/adapters/bidderFactory.js').Bid} Bid
 * @typedef {import('../src/adapters/bidderFactory.js').BidderRequest} BidderRequest
 * @typedef {import('../src/adapters/bidderFactory.js').ServerResponse} ServerResponse
 * @typedef {import('../src/adapters/bidderFactory.js').SyncOptions} SyncOptions
 * @typedef {import('../src/adapters/bidderFactory.js').UserSync} UserSync
 */

export const spec = {
  code: BIDDER_CODE,
  gvlid: GVL_ID,
  aliases: ['smile', 'sw'],
  supportedMediaTypes: [BANNER, VIDEO, NATIVE],
  /**
   * Determines whether or not the given bid request is valid.
   *
   * @param {BidRequest} bid The bid to validate.
   * @return boolean True if this is a valid bid, and false otherwise.
   */
  isBidRequestValid: function(bid) {
    if (!bid.params || !bid.params.zoneId) {
      return false;
    }

    if (deepAccess(bid, 'mediaTypes.video')) {
      const videoMediaTypesParams = deepAccess(bid, 'mediaTypes.video', {});
      const videoBidderParams = deepAccess(bid, 'params.video', {});

      const videoParams = {
        ...videoMediaTypesParams,
        ...videoBidderParams
      };

      if (!videoParams.context || ![INSTREAM, OUTSTREAM].includes(videoParams.context)) {
        return false;
      }
    }

    return true;
  },

  buildOrtbRequests(bidRequests, bidderRequest) {
    let requests = [];

    // Videos
    const videoBids = bidRequests.filter(bid => isVideoBid(bid));
    videoBids.forEach(bid => {
      requests.push(createRequest([bid], bidderRequest, VIDEO));
    });

    // Natives
    const nativeBids = bidRequests.filter(bid => isNativeBid(bid));
    nativeBids.forEach(bid => {
      requests.push(createRequest([bid], bidderRequest, NATIVE));
    });

    // Banner
    const bannerBids = bidRequests.filter(bid => !isVideoBid(bid) && !isNativeBid(bid));
    bannerBids.forEach(bid => {
      requests.push(createRequest([bid], bidderRequest, BANNER));
    });

    return requests;
  },

  /**
   * CURRENTLY NOT USED
   *
   * Make a server request from the list of BidRequests.
   *
   * @param {BidRequest[]} validBidRequests A non-empty list of valid bid requests that should be sent to the Server.
   * @param {BidderRequest} bidderRequest bidder request object.
   * @return ServerRequest Info describing the request to the server.
   */
  buildRequests: function(validBidRequests, bidderRequest) {
    validBidRequests = convertOrtbRequestToProprietaryNative(validBidRequests);

    return validBidRequests.map(bid => {
      const payload = {
        zoneId: bid.params.zoneId,
        currencyCode: config.getConfig('currency.adServerCurrency') || CURRENCY,
        tagId: bid.adUnitCode,
        sizes: bid.sizes.map(size => ({
          w: size[0],
          h: size[1]
        })),
        transactionId: bid.ortb2Imp?.ext?.tid,
        timeout: bidderRequest?.timeout,
        bidId: bid.bidId,
        /**
         positionType is undocumented
        It is unclear what this parameter means.
        If it means the same as pos in openRTB,
        It should read from openRTB object
        or from mediaTypes.banner.pos
         */
        positionType: bid.params.positionType || '',
        prebidVersion: '$prebid.version$',
        schain: serializeSupplyChain(bid.schain, ['asi', 'sid', 'hp', 'rid', 'name', 'domain', 'ext']),
      };
      const floor = getBidFloor(bid);
      if (floor) {
        payload.bidfloor = floor;
      }

      if (bid.params.bidfloor) {
        payload.bidfloor = bid.params.bidfloor;
      }

      if (bidderRequest?.refererInfo) {
        payload.pageDomain = bidderRequest.refererInfo.page || '';
      }

      if (bidderRequest?.gdprConsent) {
        payload.gdpr_consent = bidderRequest.gdprConsent.consentString;
        payload.gdpr = bidderRequest.gdprConsent.gdprApplies; // we're handling the undefined case server side
      }

      payload.eids = bid?.userIdAsEids;

      const videoMediaType = deepAccess(bid, 'mediaTypes.video');
      const context = deepAccess(bid, 'mediaTypes.video.context');

      if (bid.mediaType === 'video' || (videoMediaType && context === INSTREAM) || (videoMediaType && context === OUTSTREAM)) {
        payload.context = context;
        payload.videoParams = deepClone(videoMediaType);
      }

      const nativeMediaType = deepAccess(bid, 'mediaTypes.native');

      if (nativeMediaType) {
        payload.context = 'native';
        payload.nativeParams = nativeMediaType;
        let sizes = deepAccess(bid, 'mediaTypes.native.image.sizes', []);

        if (sizes.length > 0) {
          const size = Array.isArray(sizes[0]) ? sizes[0] : sizes;

          payload.width = size[0] || payload.width;
          payload.height = size[1] || payload.height;
        }
      }

      const payloadString = JSON.stringify(payload);
      return {
        method: 'POST',
        url: SMILEWANTED_ENDPOINT,
        data: payloadString,
      };
    });
  },

  /**
   * CURRENTLY NOT USED
   *
   * Unpack the response from the server into a list of bids.
   *
   * @param {ServerResponse} serverResponse A successful response from the server.
   * @param {BidRequest} bidRequest
   * @return {Bid[]} An array of bids which were nested inside the server.
   */
  interpretResponse: function(serverResponse, bidRequest) {
    if (!serverResponse.body) return [];
    const bidResponses = [];

    try {
      const response = serverResponse.body;
      const bidRequestData = JSON.parse(bidRequest.data);
      if (response) {
        const dealId = response.dealId || '';
        const bidResponse = {
          ad: response.ad,
          cpm: response.cpm,
          creativeId: response.creativeId,
          currency: response.currency,
          dealId: response.dealId,
          height: response.height,
          netRevenue: response.isNetCpm,
          requestId: bidRequestData.bidId,
          ttl: response.ttl,
          width: response.width,
        };

        if (response.formatTypeSw === 'video_instream' || response.formatTypeSw === 'video_outstream') {
          bidResponse['mediaType'] = 'video';
          bidResponse['vastUrl'] = response.ad;
          bidResponse['ad'] = null;

          if (response.formatTypeSw === 'video_outstream') {
            bidResponse['renderer'] = newRenderer(bidRequestData, response);
          }
        }

        if (response.formatTypeSw === 'native') {
          const nativeAdResponse = JSON.parse(response.ad);
          const ortbNativeRequest = toOrtbNativeRequest(bidRequestData.nativeParams);
          bidResponse['mediaType'] = 'native';
          bidResponse['native'] = toLegacyResponse(nativeAdResponse, ortbNativeRequest);
        }

        if (dealId.length > 0) {
          bidResponse.dealId = dealId;
        }

        bidResponse.meta = {};
        if (response.meta?.advertiserDomains && isArray(response.meta.advertiserDomains)) {
          bidResponse.meta.advertiserDomains = response.meta.advertiserDomains;
        }
        bidResponses.push(bidResponse);
      }
    } catch (error) {
      logError('Error while parsing smilewanted response', error);
    }

    return bidResponses;
  },

  /**
   * CURRENTLY NOT USED
   *
   * Register the user sync pixels which should be dropped after the auction.
   *
   * @param {SyncOptions} syncOptions Which user syncs are allowed?
   * @param {ServerResponse[]} responses List of server's responses.
   * @param {Object} gdprConsent The GDPR consent parameters
   * @param {Object} uspConsent The USP consent parameters
   * @return {UserSync[]} The user syncs which should be dropped.
   */
  getUserSyncs: function (syncOptions, responses, gdprConsent, uspConsent) {
    const syncs = [];

    if (syncOptions.iframeEnabled) {
      let params = [];

      if (gdprConsent && typeof gdprConsent.consentString === 'string') {
        // add 'gdpr' only if 'gdprApplies' is defined
        if (typeof gdprConsent.gdprApplies === 'boolean') {
          params.push(`gdpr=${Number(gdprConsent.gdprApplies)}&gdpr_consent=${gdprConsent.consentString}`);
        } else {
          params.push(`gdpr_consent=${gdprConsent.consentString}`);
        }
      }

      if (uspConsent) {
        params.push(`us_privacy=${encodeURIComponent(uspConsent)}`);
      }

      const paramsStr = params.length > 0 ? '?' + params.join('&') : '';

      syncs.push({
        type: 'iframe',
        url: 'https://csync.smilewanted.com' + paramsStr
      });
    }

    return syncs;
  }
}

/**
 * Create SmileWanted renderer
 * @param bidRequest
 * @param bidResponse
 * @returns {*}
 */
function newRenderer(bidRequest, bidResponse) {
  const renderer = Renderer.install({
    id: bidRequest.bidId,
    url: bidResponse.OustreamTemplateUrl,
    loaded: false
  });

  try {
    renderer.setRender(outstreamRender);
  } catch (err) {
    logWarn('Prebid Error calling setRender on newRenderer', err);
  }
  return renderer;
}

/**
 * Initialise SmileWanted outstream
 * @param bid
 */
function outstreamRender(bid) {
  bid.renderer.push(() => {
    window.SmileWantedOutStreamInit({
      width: bid.width,
      height: bid.height,
      vastUrl: bid.vastUrl,
      elId: bid.adUnitCode
    });
  });
}

const converter = ortbConverter({
  context: {
    netRevenue: true, // TODO
    ttl: TTL,
    currency: CURRENCY
  },
  imp(buildImp, bidRequest, context) {
    const imp = buildImp(bidRequest, context);
    const bidfloor = bidRequest.params.bidfloor || 0;
    if (0 != bidfloor) {
      imp.bidfloor = bidfloor;
      imp.bidfloorcur = context.currencyCode;
    }

    imp.ext.bidder = bidRequest.params.zoneId;
    if (bidRequest.adUnitCode !== undefined) {
      imp.ext.data = {pbadslot: bidRequest.adUnitCode};
    }
    return imp;
  },
  request(buildRequest, imps, bidderRequest, context) {
    const request = buildRequest(imps, bidderRequest, context);
    const bidRequest = context.bidRequests[0];

    request.ext = {prebidVersion: '$prebid.version$'};
    if (bidRequest.timeout !== undefined) {
      request.tmax = bidRequest.timeout;
    }

    request.positionType = bidRequest?.params?.positionType || '';

    const bidSchain = bidRequest?.schain;
    if (bidSchain !== undefined) {
      if (request.source.ext === undefined) {
        request.source.ext = {};
      }
      request.source.ext.schain = bidSchain;
    }

    if (bidderRequest?.gdprConsent) {
      if (request?.user === undefined) {
        request.user = {ext:{}};
      }
      request.user.ext.consent = bidderRequest.gdprConsent.consentString;

      if (request.regs === undefined) {
        request.regs = {ext: {}};
      }
      request.regs.ext.gdpr = bidderRequest.gdprConsent.gdprApplies; // we're handling the undefined case server side
    }

    return request;
  }
});

/**
 * Get the floor price from bid.params for backward compatibility.
 * If not found, then check floor module.
 * @param bid A valid bid object
 * @param mediaType string
 * @returns {*|number} floor price
 */
function getBidFloor(bid, mediaType) {
  if (isFn(bid.getFloor)) {
    const floorInfo = bid.getFloor({
      currency: CURRENCY,
      mediaType: mediaType || BANNER,
      size: bid.sizes.map(size => ({ w: size[0], h: size[1] }))
    });
    if (isPlainObject(floorInfo) && !isNaN(floorInfo.floor) && floorInfo.currency === CURRENCY) {
      return parseFloat(floorInfo.floor);
    }
  }
  return null;
}

function createRequest(bidRequests, bidderRequest, mediaType) {
  const context = {
    mediaType: mediaType,
    currencyCode: config.getConfig('currency.adServerCurrency') || CURRENCY
  };

  return {
    method: 'POST',
    url: SMILEWANTED_ENDPOINT,
    data: converter.toORTB({
      bidRequests,
      bidderRequest,
      context,
    }),
  };
}


function isVideoBid(bid) {
  return utils.deepAccess(bid, 'mediaTypes.video');
}

function isNativeBid(bid) {
  return utils.deepAccess(bid, 'mediaTypes.native');
}

registerBidder(spec);
