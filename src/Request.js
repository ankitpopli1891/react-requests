import axios from 'axios';
import invariant from 'invariant';
import PropTypes from 'prop-types';
import React from 'react';

import * as STATE from './States';

const [ArrayBuffer, ArrayBufferView, URLSearchParams] = [
    ArrayBuffer || Object,
    ArrayBufferView || Object,
    URLSearchParams || Object
];

const getConfig = (props) => {
    const {
        url, method, headers, params,
        data, timeout, auth, responseType,
        xsrfCookieName, xsrfHeaderName, tag
    } = props;

    return {
        url, method, headers, params,
        data, timeout, auth, responseType,
        xsrfCookieName, xsrfHeaderName, tag
    };
};

class Request extends React.Component {
    constructor(props, context) {
        super(props, context);
        this.state = {
            status: STATE.INIT,
            response: null,
            error: null,
            tag: props.tag
        };
        this.axios = axios.create();
        this.axios.interceptors.response.use(this.cacheResponseInterceptor);
    }

    // noinspection JSUnusedGlobalSymbols
    getChildContext() {
        return {
            ...this.state
        };
    }

    render() {
        const {children} = this.props;

        invariant(children || React.Children.count(children) === 1,
            'A <Request> may have only one child element'
        );

        return (
            (children) ? React.Children.only(children) : null
        );
    }

    /**
     * componentDidMount() is invoked immediately after a component is mounted.
     * Initialization that requires DOM nodes should go here.
     * If you need to load data from a remote endpoint,
     * this is a good place to instantiate the network request.
     * Setting state in this method will trigger a re-rendering.
     */
    componentDidMount() {
        if (!this.props.defer) {
            this.fire();
        }
    }

    /**
     * componentDidUpdate() is invoked immediately after updating occurs.
     * This method is not called for the initial render.
     * Use this as an opportunity to operate on the DOM when the component has been updated.
     * This is also a good place to do network requests as long as you compare
     * the current props to previous props
     * (e.g. a network request may not be necessary if the props have not changed).
     */
    componentDidUpdate(prevProps) {
        // we don't need to consider the state change to determine
        // whether the component should be updated
        // since the state change is actually not reflected
        // we wanted to do all this in `shouldComponentUpdate`,
        // but we do want to update the children when state changes
        // we'll be checking if any of the props has changed the config for the axios
        // if the config has been changed only then the request should be fired

        // this should be slow as heck,
        // will change the implementation asap
        if (JSON.stringify(getConfig(this.props)) === JSON.stringify(getConfig(prevProps))) {
            return;
        }

        if (!this.props.defer) {
            this.fire();
        }
    }

    onSuccess = () => {
        this.props.onSuccess(this.state.response);
    };

    onFailure = () => {
        this.props.onFailure(this.state.response);
    };

    onError = () => {
        this.props.onError(this.state.error);
    };

    fire = () => {
        const cachedResponse = this.getCachedResponse();
        if (cachedResponse !== undefined) {
            // FIXME
            this.setState({status: STATE.SUCCESS, response: cachedResponse},
                (this.props.onSuccess) ? this.onSuccess : undefined
            );
            return;
        }

        const config = getConfig(this.props);

        // remove the undefined keys
        Object.keys(config).map((k) => config[k] === undefined ? delete config[k] : false);

        this.setState({status: STATE.START}, this.props.onStart);
        this.axios.request(config).then((response) => {
            const code = Math.round(response.status / 100);
            switch (code) {
                case 2:
                    this.setState({status: STATE.SUCCESS, response},
                        (this.props.onSuccess) ? this.onSuccess : undefined
                    );
                    break;
                default:
                    this.setState({status: STATE.FAILURE, response},
                        (this.props.onFailure) ? this.onFailure : undefined
                    );
            }
        }).catch((err) => {
            this.setState({status: STATE.ERROR, error: err},
                (this.props.onError) ? this.onError : undefined
            );

            // throwing the error prior to setting state,
            // prevents error block from getting displayed
            // also, always false, we want to propagate the root causes
            invariant(false, err.stack);
        });
    };

    cacheResponseInterceptor = (response) => {
        // cache has not been configured
        const {cache, tag} = this.props;
        if (cache === undefined) {
            return response;
        }

        // https://developer.mozilla.org/en-US/docs/Glossary/cacheable
        // rely on Cache-Control! :thinking:
        const cacheableMethods = ['head', 'get', 'post'];
        if (cacheableMethods.indexOf(response.config.method.toLowerCase()) === -1) {
            return;
        }

        invariant(
            cache !== undefined && this.context.store !== undefined,
            'caching is only available when store is configured'
        );
        invariant(
            cache !== undefined && tag !== undefined,
            'tag property is required for caching'
        );

        const {data, status} = response;
        this.context.store.dispatch({
            type: 'CACHE_REQUEST',
            payload: {
                tag,
                response: {data, status},
                timeout: cache
            }
        });

        return response;
    };

    getCachedResponse = () => {
        const {tag} = this.props;
        const {store} = this.context;
        if (!store) return;

        const state = store.getState();
        const {response} = state.requests[tag] || {};
        return response;
    };
}

/*
 * See: https://github.com/mzabriskie/axios#request-config
 * More PropTypes will be added as & when required.
 */
Request.propTypes = {
    // `url` is the server URL that will be used for the request
    url: PropTypes.string.isRequired,

    // the http method is not required by axios &
    // defaults to 'get' if not provided
    method: PropTypes.oneOf(['get', 'post', 'put', 'patch', 'delete', 'head']),

    // `headers` are custom headers to be sent
    headers: PropTypes.object,

    // `params` are the URL parameters to be sent with the request
    // Must be a plain object or a URLSearchParams object
    params: PropTypes.object,

    // `data` is the data to be sent as the request body
    // Only applicable for request methods 'PUT', 'POST', and 'PATCH'
    // When no `transformRequest` is set, must be of one of the following types:
    // - string, plain object, ArrayBuffer, ArrayBufferView, URLSearchParams
    // - Browser only: FormData, File, Blob
    // - Node only: Stream
    data: PropTypes.oneOfType([
        PropTypes.string,
        PropTypes.object,
        PropTypes.instanceOf(ArrayBuffer),
        PropTypes.instanceOf(ArrayBufferView),
        PropTypes.instanceOf(URLSearchParams)
    ]),

    // `paramsSerializer` is an optional function in charge of serializing `params`
    // (e.g. https://www.npmjs.com/package/qs, http://api.jquery.com/jquery.param/)
    // default: function(params) { return Qs.stringify(params, {arrayFormat: 'brackets'}) }
    paramsSerializer: PropTypes.func,

    // `transformRequest` allows changes to the request data before it is sent to the server
    // This is only applicable for request methods 'PUT', 'POST', and 'PATCH'
    // The last function in the array must return a string, an ArrayBuffer, FormData, or a Stream
    transformRequest: PropTypes.arrayOf(PropTypes.func),

    // `transformResponse` allows changes to the response data to be made before
    // it is passed to then/catch
    transformResponse: PropTypes.arrayOf(PropTypes.func),

    // `validateStatus` defines whether to resolve or reject the promise for a given
    // HTTP response status code. If `validateStatus` returns `true` (or is set to `null`
    // or `undefined`), the promise will be resolved; otherwise, the promise will be
    // rejected.
    // default: function (status) { return status >= 200 && status < 300; }
    validateStatus: PropTypes.func,

    // `maxRedirects` defines the maximum number of redirects to follow in node.js.
    // If set to 0, no redirects will be followed.
    // default: 5
    maxRedirects: PropTypes.number,

    // `timeout` specifies the number of milliseconds before the request times out.
    // If the request takes longer than `timeout`, the request will be aborted.
    timeout: PropTypes.number,

    // `auth` indicates that HTTP Basic auth should be used, and supplies credentials.
    // This will set an `Authorization` header, overwriting any existing
    // `Authorization` custom headers you have set using `headers`.
    // { username: 'janedoe', password: 's00pers3cret' }
    auth: PropTypes.shape({
        username: PropTypes.string,
        password: PropTypes.string
    }),

    // `responseType` indicates the type of data that the server will respond with
    // options are 'arraybuffer', 'blob', 'document', 'json', 'text', 'stream'
    // default: json
    responseType: PropTypes.oneOf(['arraybuffer', 'blob', 'document', 'json', 'text', 'stream']),

    // `xsrfCookieName` is the name of the cookie to use as a value for xsrf token
    // default: 'XSRF-TOKEN'
    xsrfCookieName: PropTypes.string,

    // `xsrfHeaderName` is the name of the http header that carries the xsrf token value
    // default: 'X-XSRF-TOKEN'
    xsrfHeaderName: PropTypes.string,


    // callback fired just before the request is fired
    onStart: PropTypes.func,

    // callback fired after the response
    // comes back with status 2XX
    onSuccess: PropTypes.func,

    // callback fired after the response
    // comes back with status other 2XX
    onFailure: PropTypes.func,

    // callback fired when
    // something else goes wrong
    onError: PropTypes.func,

    // defer signals the Request component to not fire the
    // request as soon as ready instead construct the request and
    // wait for the manual trigger
    // useful for cases when either the data is incomplete
    // or we want to wait for a CTA
    defer: PropTypes.bool,

    // request can be tagged for enabling nested scenarios
    // we might want to render a component based on
    // request sent way above the hierarchy of the component
    // super grand parent component :P
    tag: PropTypes.string
};

Request.contextTypes = {
    store: PropTypes.object
};

Request.childContextTypes = {
    status: PropTypes.oneOf(STATE.ALL),
    response: PropTypes.object,
    error: PropTypes.object,
    tag: PropTypes.string
};


export default Request;
