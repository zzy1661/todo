import { connect } from 'react-redux';
import TodoPlan from '../components/TodoPlan';

const mapStateToProps = (state) => {
    return {
        router: state.router,
        ...state.basic,       
    }
}
const mapDispatchToProps = (dispatch) => {
    return {
        removeUser: (username, userToken) => {          
            dispatch({ type: 'logout'});
        }
    }
}
export default connect(mapStateToProps, mapDispatchToProps)(TodoPlan)