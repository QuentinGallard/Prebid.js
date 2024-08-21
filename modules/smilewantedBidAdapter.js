import {deepAccess, deepClone, isArray, isFn, isPlainObject, logError, logWarn} from '../src/utils.js';
import {Renderer} from '../src/Renderer.js';
import {config} from '../src/config.js';
import {registerBidder} from '../src/adapters/bidderFactory.js';
import {BANNER, NATIVE, VIDEO} from '../src/mediaTypes.js';
import {INSTREAM, OUTSTREAM} from '../src/video.js';
import {serializeSupplyChain} from '../libraries/schainSerializer/schainSerializer.js'
import {ortbConverter} from '../libraries/ortbConverter/converter.js'
import {convertOrtbRequestToProprietaryNative, toOrtbNativeRequest, toLegacyResponse} from '../src/native.js';

const BIDDER_CODE = 'smilewanted';
const SMILEWANTED_ENDPOINT = 'https://prebid.smilewanted.com';
const SMILEWANTED_CSYNC_URL = 'https://csync.smilewanted.com';
const GVL_ID = 639;
const CURRENCY = 'EUR';
const TTL = 300;

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

    // Utiliser getFloor

    const videoBids = bidRequests.filter(bid => deepAccess(bid, 'mediaTypes.video'));
    videoBids.forEach(bid => {
      requests.push(createRequest([bid], bidderRequest, VIDEO));
    });

    const nativeBids = bidRequests.filter(bid => deepAccess(bid, 'mediaTypes.native'));
    nativeBids.forEach(bid => {
      requests.push(createRequest([bid], bidderRequest, NATIVE));
    });

    const bannerBids = bidRequests.filter(bid => !deepAccess(bid, 'mediaTypes.video') && !deepAccess(bid, 'mediaTypes.native'));
    bannerBids.forEach(bid => {
      requests.push(createRequest([bid], bidderRequest, BANNER));
    });

    return requests;
  },

  /**
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
   * Unpack the response from the server into a list of bids.
   *
   * @param {ServerResponse} serverResponse A successful response from the server.
   * @param {BidRequest} bidRequest
   * @return {Bid[]} An array of bids which were nested inside the server.
   */
  interpretOrtbResponse: function(serverResponse, bidRequest) {
    return CONVERTER.fromORTB({request: bidRequest, response: serverResponse.body}).bids;
  },
  /**
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
        url: SMILEWANTED_CSYNC_URL + paramsStr
      });
    }

    return syncs;
  }
};

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

export const CONVERTER = ortbConverter({
  context: {
    netRevenue: true,
    ttl: TTL,
    currency: CURRENCY
  },
  imp(buildImp, bidRequest, context) {
    const imp = buildImp(bidRequest, context);
    imp.bidfloorcur = context.currencyCode;
    // TODO : utiliser getBidFloor ?
    const bidfloor = bidRequest.params.bidfloor || 0;
    if (0 != bidfloor) {
      imp.bidfloor = bidfloor;
    }

    imp.ext.bidder = {zoneId: bidRequest.params.zoneId};
    if (deepAccess(bidRequest, 'adUnitCode')) {
      imp.tagid = bidRequest.adUnitCode;
    }

    if (context.mediaType === BANNER && bidRequest.mediaTypes?.banner === undefined && bidRequest.sizes) {
      imp.banner = {
        format: bidRequest.sizes.map(size => ({ w: size[0], h: size[1] }))
      };
    }

    if (context.mediaType === VIDEO) {
      const videoContext = deepAccess(bidRequest, 'mediaTypes.video.context');
      if (videoContext) {
        let videoExt = deepAccess(imp, 'video.ext');
        if (!videoExt) {
          imp.video.ext = {};
        }
        imp.video.ext.context = videoContext;
      }
    }

    return imp;
  },
  request(buildRequest, imps, bidderRequest, context) {
    const request = buildRequest(imps, bidderRequest, context);
    const bidRequest = context.bidRequests[0];

    // PrebidJs Version and timeout
    request.ext = {prebidVersion: '$prebid.version$'};
    if (deepAccess(bidRequest, 'timeout')) {
      request.tmax = bidRequest.timeout;
    }

    // PositionType
    if (deepAccess(bidRequest, 'params.positionType')) {
      request.ext.positionType = bidRequest?.params?.positionType;
    }

    // External Ids
    if (deepAccess(bidRequest, 'userIdAsEids')) {
      if (!deepAccess(bidRequest, 'user.ext')) {
        request.user = {ext:{}};
      }
      request.user.ext.eids = bidRequest.userIdAsEids;
    }

    // get the referer via refererInfo.page
    if (!deepAccess(bidderRequest, 'ortb2.site.page') && deepAccess(bidderRequest, 'refererInfo.page')) {
      if (!deepAccess(request, 'site')) {
        request.site = {};
      }

      request.site.page = deepAccess(bidderRequest, 'refererInfo.page');
    }

    // GDPR
    if (deepAccess(bidderRequest, 'gdprConsent')) {
      if (deepAccess(bidderRequest, 'gdprConsent.consentString')) {
        if (!deepAccess(bidRequest, 'user.ext')) {
          request.user = {ext: {}};
        }
        request.user.ext.consent = bidderRequest.gdprConsent.consentString;
      }

      const gdprApplies = deepAccess(bidderRequest, 'gdprConsent.gdprApplies');
      if (gdprApplies) {
        if (!deepAccess(bidRequest, 'regs')) {
          request.regs = {ext: {}};
        }
        request.regs.ext.gdpr = gdprApplies;
      }
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

  const data = CONVERTER.toORTB({
    bidRequests,
    bidderRequest,
    context,
  })

  return {
    method: 'POST',
    url: SMILEWANTED_ENDPOINT,
    data: data,
  };
}

registerBidder(spec);
