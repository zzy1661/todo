import React, { Component } from 'react';

class Statistics extends Component {
    constructor(props){
        super(props);
    }
    onclick = () => {
        var path = {
            pathname:'/index/edit/111',
            state:{name:1,id:2},
          }
        this.props.history.push(path);
    }
    render () {
        var data = this.props.location.state;
        
        return (
            <div>statistics{this.props.match.params.taskId}
                <button onClick={this.onclick}>btn</button>
                {data?(data.id+data.name):''}
            </div>
        )
    }
}
export default Statistics;