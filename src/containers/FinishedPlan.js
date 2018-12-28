import { connect } from 'react-redux';
import FinishedPlan from '../components/FinishedPlan';

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
export default connect(mapStateToProps, mapDispatchToProps)(FinishedPlan)