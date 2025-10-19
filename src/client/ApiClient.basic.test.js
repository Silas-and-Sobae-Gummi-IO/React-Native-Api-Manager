
describe('ApiClient - configs', () => {
    describe('config - baseUrl', () => {
        it('base url are used across same client', () => {
            const apiClient = new ApiClient({baseUrl: 'http://domain.com'});

            apiClient.get('users').send();
            fetch.calledOnce().with({'url': 'http://domain.com/users'});

            apiClient.get('posts').send();
            fetch.calledOnce().with({'url': 'http://domain.com/posts'});
        })
    })

    it('')
})

describe('ApiClient - requests', () => {
    describe('Get Requests', () => {
        it('can sent a get request', () => {
            apiClient.get('http://domain.com');

            fetch.calledOnce().with({'url': 'http://domain.com')
        })
    })

    it('')
})

describe('ApiClient - interceptors', () => {
    it('Has default builtin interceptors', () => {
        const apiClient = new ApiCLient();

        const loadedInterceptors = apiClient.interceptors.providers.keys();
        expect(loadedInterceptors).includes('core');
        expect(loadedInterceptors).includes('logger');
    })

    it('')
})
