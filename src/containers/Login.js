import { connect } from 'react-redux';
import Login from '../components/Login';
import {login as loginHandler} from '../actions/commonActions'
import { push } from 'connected-react-router';

const mapStateToProps = (state) => {
    return {
        router: state.router,
        ...state.user,       
    }
}
const mapDispatchToProps = (dispatch) => {
    return {
        onLogin: (username, userToken) => {
            dispatch(loginHandler(username, userToken))
        }
    }
}
export default connect(mapStateToProps, mapDispatchToProps)(Login)