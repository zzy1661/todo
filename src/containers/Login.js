import { connect } from 'react-redux';
import Login from '../components/Login';
import {push} from 'connected-react-router';
import {login as loginHandler} from '../actions/commonActions'
const mapStateToProps = (state) => {
    return {
        router: state.router,
        ...state.user,       
    }
}
const mapDispatchToProps = (dispatch) => {
    return {
        test: ()=>{
            dispatch(loginHandler())
        },
        onLogin: (username, userToken) => {
            dispatch({ type: 'saveUser', username, userToken })
        }
    }
}
export default connect(mapStateToProps, mapDispatchToProps)(Login)